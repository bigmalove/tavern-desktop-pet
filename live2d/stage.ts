import { log, warn } from '../utils/dom';
import { GestureRecognizer, type GestureEvent } from '../utils/gesture-recognizer';
import { Live2DLoader } from './loader';

/**
 * Live2D PIXI 渲染舞台
 * 在酒馆页面创建 fixed 定位的 canvas，支持拖拽和缩放
 */
export const Live2DStage = {
  app: null as any,
  canvas: null as HTMLCanvasElement | null,
  container: null as HTMLDivElement | null,
  mountStack: [] as Array<{
    parent: ParentNode | null;
    nextSibling: ChildNode | null;
    styleText: string;
    width: number;
    height: number;
    onPositionChange: ((x: number, y: number) => void) | null;
  }>,
  mountMode: 'floating' as 'floating' | 'preview',
  _pendingFloatingResize: null as { width: number; height: number } | null,
  loadingOverlay: null as HTMLDivElement | null,
  loadingText: null as HTMLDivElement | null,
  loadingBarFill: null as HTMLDivElement | null,
  gestureRecognizer: null as GestureRecognizer | null,
  _dragClass: 'desktop-pet-dragging',
  _minVisiblePx: 48,
  _onPositionChange: null as ((x: number, y: number) => void) | null,
  _boundWindowResize: null as (() => void) | null,

  _clampPosition(
    x: number,
    y: number,
    width: number,
    height: number,
    minVisible: number = 0,
  ): { x: number; y: number; clamped: boolean } {
    const top = this._top();
    const viewportWidth = top.innerWidth || top.document.documentElement.clientWidth || width;
    const viewportHeight = top.innerHeight || top.document.documentElement.clientHeight || height;

    const safeWidth = Number.isFinite(width) && width > 0 ? width : viewportWidth;
    const safeHeight = Number.isFinite(height) && height > 0 ? height : viewportHeight;
    const safeMinVisibleX = Math.max(0, Math.min(minVisible, safeWidth, viewportWidth));
    const safeMinVisibleY = Math.max(0, Math.min(minVisible, safeHeight, viewportHeight));

    const minX = Math.min(0, -safeWidth + safeMinVisibleX);
    const minY = Math.min(0, -safeHeight + safeMinVisibleY);
    const maxX = Math.max(0, viewportWidth - safeMinVisibleX);
    const maxY = Math.max(0, viewportHeight - safeMinVisibleY);
    const safeX = Number.isFinite(x) ? x : 0;
    const safeY = Number.isFinite(y) ? y : 0;
    const clampedX = Math.min(Math.max(safeX, minX), maxX);
    const clampedY = Math.min(Math.max(safeY, minY), maxY);
    return { x: clampedX, y: clampedY, clamped: clampedX !== safeX || clampedY !== safeY };
  },

  _shouldClampCurrentPosition(): boolean {
    if (!this.container) return false;
    if (this.mountMode === 'preview') return false;

    // 默认位置使用 right/bottom 固定，无需在 resize 时写入 left/top（避免把默认位置持久化成数值）
    const hasCustom = this.container.style.right === 'auto' || this.container.style.bottom === 'auto';
    const hasExplicitLeftTop = !!this.container.style.left || !!this.container.style.top;
    return hasCustom || hasExplicitLeftTop;
  },

  _getContainerRectSize(options: { width: number; height: number }): { width: number; height: number } {
    const rect = this.container?.getBoundingClientRect?.();
    return {
      width: rect?.width && rect.width > 0 ? rect.width : options.width,
      height: rect?.height && rect.height > 0 ? rect.height : options.height,
    };
  },

  _clampContainerToViewport(options: { width: number; height: number }, reason: string): void {
    if (!this.container) return;
    if (!this._shouldClampCurrentPosition()) return;

    const rect = this.container.getBoundingClientRect();
    const size = this._getContainerRectSize(options);
    const clamped = this._clampPosition(
      rect.left,
      rect.top,
      size.width,
      size.height,
      this._minVisiblePx,
    );

    if (!clamped.clamped) return;

    this.container.style.left = `${clamped.x}px`;
    this.container.style.top = `${clamped.y}px`;
    this.container.style.right = 'auto';
    this.container.style.bottom = 'auto';

    log(`窗口变化导致位置越界，已自动修正(${reason})`, {
      from: { x: rect.left, y: rect.top },
      to: { x: clamped.x, y: clamped.y },
    });

    this._onPositionChange?.(clamped.x, clamped.y);
  },

  _bindWindowResize(options: { width: number; height: number }): void {
    const top = this._top();
    this._unbindWindowResize();

    this._boundWindowResize = () => {
      this._clampContainerToViewport(options, 'window-resize');
    };

    try {
      top.addEventListener('resize', this._boundWindowResize, { passive: true });
    } catch (e) {
      warn('绑定窗口 resize 监听失败', e);
      this._boundWindowResize = null;
    }
  },

  _unbindWindowResize(): void {
    const top = this._top();
    if (!this._boundWindowResize) return;
    try {
      top.removeEventListener('resize', this._boundWindowResize);
    } catch {
      // ignore
    } finally {
      this._boundWindowResize = null;
    }
  },

  /** 获取父窗口 */
  _top(): Window {
    return window.parent ?? window;
  },

  /** 获取 PIXI */
  _getPIXI(): any {
    const top = this._top();
    return Live2DLoader.getPixi(top);
  },

  _enablePointerDrag(
    $container: JQuery<HTMLElement>,
    options: {
      width: number;
      height: number;
      onPositionChange?: (x: number, y: number) => void;
    },
  ): void {
    if (!this.container) return;

    const top = this._top();
    const container = this.container;
    const onPositionChange = options.onPositionChange;

    const state = {
      pointerId: null as number | null,
      startClientX: 0,
      startClientY: 0,
      startLeft: 0,
      startTop: 0,
      dragging: false,
    };

    const getRectLeftTop = () => {
      const rect = container.getBoundingClientRect();
      return { left: rect.left, top: rect.top };
    };

    const getRectSize = () => {
      const rect = container.getBoundingClientRect();
      return {
        width: rect.width > 0 ? rect.width : options.width,
        height: rect.height > 0 ? rect.height : options.height,
      };
    };

    const cleanup = () => {
      state.pointerId = null;
      state.dragging = false;
      $container.removeClass(this._dragClass);
    };

    container.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (state.pointerId !== null) return;

      state.pointerId = e.pointerId;
      state.startClientX = e.clientX;
      state.startClientY = e.clientY;

      const { left, top } = getRectLeftTop();
      state.startLeft = left;
      state.startTop = top;

      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });

    container.addEventListener('pointermove', (e: PointerEvent) => {
      if (state.pointerId === null || e.pointerId !== state.pointerId) return;

      const dx = e.clientX - state.startClientX;
      const dy = e.clientY - state.startClientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!state.dragging) {
        if (dist < 8) return;
        state.dragging = true;
        $container.addClass(this._dragClass);

        container.style.left = `${state.startLeft}px`;
        container.style.top = `${state.startTop}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      }

      const clamped = this._clampPosition(
        state.startLeft + dx,
        state.startTop + dy,
        getRectSize().width,
        getRectSize().height,
        this._minVisiblePx,
      );

      container.style.left = `${clamped.x}px`;
      container.style.top = `${clamped.y}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';
      e.preventDefault();
    }, { passive: false });

    const onPointerUp = (e: PointerEvent) => {
      if (state.pointerId === null || e.pointerId !== state.pointerId) return;

      const dragging = state.dragging;
      cleanup();

      if (!dragging) return;

      const left = parseFloat(container.style.left || '0');
      const topPx = parseFloat(container.style.top || '0');
      const size = getRectSize();
      const clamped = this._clampPosition(left, topPx, size.width, size.height, this._minVisiblePx);

      container.style.left = `${clamped.x}px`;
      container.style.top = `${clamped.y}px`;
      container.style.right = 'auto';
      container.style.bottom = 'auto';

      this._onPositionChange = onPositionChange ?? this._onPositionChange;
      this._onPositionChange?.(clamped.x, clamped.y);

      try {
        container.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      // iOS 在 pointerup 后可能出现粘滞点击，这里延迟清除 selection
      try {
        top.getSelection?.()?.removeAllRanges?.();
      } catch {
        // ignore
      }
    };

    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
  },

  _ensureLoadingOverlay(): boolean {
    if (!this.container) return false;

    const overlay = this.loadingOverlay;
    const overlayAlive = !!overlay && !!overlay.ownerDocument?.documentElement?.contains(overlay);
    if (overlayAlive) return true;

    this.hideLoadingProgress();

    const doc = this.container.ownerDocument;
    const panel = doc.createElement('div');
    panel.style.cssText = `
      position: absolute;
      left: 8px;
      right: 8px;
      bottom: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.72);
      backdrop-filter: blur(3px);
      pointer-events: none;
      z-index: 5;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      color: #e2e8f0;
      font-size: 12px;
      line-height: 1.4;
    `;

    const text = doc.createElement('div');
    text.style.cssText = 'margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    text.textContent = '正在加载模型 (0%)';

    const track = doc.createElement('div');
    track.style.cssText = 'width: 100%; height: 6px; border-radius: 999px; background: rgba(148, 163, 184, 0.35); overflow: hidden;';

    const fill = doc.createElement('div');
    fill.style.cssText = 'height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, #60a5fa, #22d3ee); transition: width 0.2s ease;';

    track.appendChild(fill);
    panel.appendChild(text);
    panel.appendChild(track);
    this.container.appendChild(panel);

    this.loadingOverlay = panel;
    this.loadingText = text;
    this.loadingBarFill = fill;
    return true;
  },

  showLoadingProgress(percent: number, message: string): void {
    if (!this._ensureLoadingOverlay()) return;

    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
    if (this.loadingText) {
      this.loadingText.textContent = `${message} (${safePercent}%)`;
    }
    if (this.loadingBarFill) {
      this.loadingBarFill.style.width = `${safePercent}%`;
    }
  },

  hideLoadingProgress(): void {
    if (this.loadingOverlay) {
      try {
        this.loadingOverlay.remove();
      } catch (e) {
        warn('加载进度条移除失败', e);
      }
    }
    this.loadingOverlay = null;
    this.loadingText = null;
    this.loadingBarFill = null;
  },

  /**
   * 创建渲染容器和 PIXI Application
   */
  create(options: {
    width: number;
    height: number;
    position: { x: number; y: number };
    scale: number;
    onPositionChange?: (x: number, y: number) => void;
    onScaleChange?: (scale: number) => void;
    onTap?: (e: GestureEvent) => void;
    onDoubleTap?: (e: GestureEvent) => void;
    onLongPress?: (e: GestureEvent) => void;
  }): boolean {
    const top = this._top();
    const PIXI = this._getPIXI();
    if (!PIXI) {
      warn('PIXI 未就绪，无法创建舞台');
      return false;
    }

    // 防止脚本热重载或重复初始化时残留多个舞台
    this.destroy();
    this._onPositionChange = options.onPositionChange ?? null;
    this._bindWindowResize({ width: options.width, height: options.height });
    const stale = top.document.getElementById('desktop-pet-stage');
    if (stale) stale.remove();

    // 创建容器 div
    this.container = top.document.createElement('div');
    this.container.id = 'desktop-pet-stage';
    this.container.style.cssText = `
      position: fixed;
      right: 20px;
      bottom: 20px;
      width: ${options.width}px;
      height: ${options.height}px;
      overflow: hidden;
      z-index: 10000;
      pointer-events: auto;
      cursor: pointer;
      touch-action: none;
    `;

    // 应用保存的位置
    const hasSavedPosition =
      Number.isFinite(options.position.x) &&
      Number.isFinite(options.position.y) &&
      !(options.position.x === -1 && options.position.y === -1);

    if (hasSavedPosition) {
      const clamped = this._clampPosition(
        options.position.x,
        options.position.y,
        options.width,
        options.height,
        this._minVisiblePx,
      );

      this.container.style.left = `${clamped.x}px`;
      this.container.style.top = `${clamped.y}px`;
      this.container.style.right = 'auto';
      this.container.style.bottom = 'auto';

      if (clamped.clamped) {
        log('检测到宠物位置超出可视区域，已自动修正', {
          from: options.position,
          to: { x: clamped.x, y: clamped.y },
        });
        options.onPositionChange?.(clamped.x, clamped.y);
      }
    }

    top.document.body.appendChild(this.container);

    // 创建 canvas
    this.canvas = top.document.createElement('canvas');
    this.canvas.style.cssText = 'width: 100%; height: 100%;';
    this.container.appendChild(this.canvas);

    // 创建 PIXI Application
    const dpr = top.devicePixelRatio || 1;
    this.canvas.width = Math.floor(options.width * dpr);
    this.canvas.height = Math.floor(options.height * dpr);

    const glContext =
      this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: true,
        stencil: true,
        depth: true,
        preserveDrawingBuffer: true,
        premultipliedAlpha: true,
      }) ||
      this.canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        stencil: true,
        depth: true,
        preserveDrawingBuffer: true,
        premultipliedAlpha: true,
      });

    if (!glContext) {
      warn('WebGL 不可用');
      return false;
    }

    try {
      const attrs = (glContext as WebGLRenderingContext | WebGL2RenderingContext).getContextAttributes?.();
      if (attrs && attrs.stencil === false) {
        warn('当前 WebGL 上下文未提供 stencil buffer，部分遮罩可能异常');
      }
    } catch {
      // ignore
    }

    this.app = new PIXI.Application({
      view: this.canvas,
      context: glContext,
      backgroundAlpha: 0,
      autoStart: true,
      width: options.width,
      height: options.height,
      resolution: dpr,
      autoDensity: true,
      antialias: true,
    });

    // 使用 jQueryUI 实现拖拽
    const $container = $(this.container);
    const draggable = ($container as any).draggable;
    if (typeof draggable === 'function') {
      try {
        $container.draggable({
          start: (_e: any, ui: any) => {
            $container.addClass(this._dragClass);

            const rect = this.container?.getBoundingClientRect?.();
            if (!rect) return;

            this.container!.style.left = `${rect.left}px`;
            this.container!.style.top = `${rect.top}px`;
            this.container!.style.right = 'auto';
            this.container!.style.bottom = 'auto';

            if (ui?.position) {
              ui.position.left = rect.left;
              ui.position.top = rect.top;
            }
          },
          drag: (_e: any, ui: any) => {
            const rect = this.container?.getBoundingClientRect?.();
            const width = rect?.width && rect.width > 0 ? rect.width : options.width;
            const height = rect?.height && rect.height > 0 ? rect.height : options.height;

            const clamped = this._clampPosition(ui.position.left, ui.position.top, width, height, this._minVisiblePx);
            ui.position.left = clamped.x;
            ui.position.top = clamped.y;
          },
          stop: (_e: any, ui: any) => {
            $container.removeClass(this._dragClass);

            const rect = this.container?.getBoundingClientRect?.();
            const width = rect?.width && rect.width > 0 ? rect.width : options.width;
            const height = rect?.height && rect.height > 0 ? rect.height : options.height;

            const clamped = this._clampPosition(
              ui.position.left,
              ui.position.top,
              width,
              height,
              this._minVisiblePx,
            );

            this.container!.style.left = `${clamped.x}px`;
            this.container!.style.top = `${clamped.y}px`;
            this.container!.style.right = 'auto';
            this.container!.style.bottom = 'auto';

            this._onPositionChange?.(clamped.x, clamped.y);
          },
        });
      } catch (e) {
        warn('jQueryUI draggable 初始化失败，已回退为原生拖拽', e);
        this._enablePointerDrag($container, {
          width: options.width,
          height: options.height,
          onPositionChange: options.onPositionChange,
        });
      }
    } else {
      warn('未检测到 jQueryUI draggable，已回退为原生拖拽');
      this._enablePointerDrag($container, {
        width: options.width,
        height: options.height,
        onPositionChange: options.onPositionChange,
      });
    }

    // 鼠标滚轮缩放
    this.container.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newScale = Math.max(0.1, Math.min(3, options.scale + delta));
      options.scale = newScale;
      options.onScaleChange?.(newScale);
    }, { passive: false });

    // 手势识别（替代原来的 click 事件）
    this.gestureRecognizer = new GestureRecognizer(
      this.container,
      {},
      (event: GestureEvent) => {
        switch (event.type) {
          case 'tap':
            options.onTap?.(event);
            break;
          case 'double-tap':
            options.onDoubleTap?.(event);
            break;
          case 'long-press':
            options.onLongPress?.(event);
            break;
        }
      },
      () => $container.hasClass('ui-draggable-dragging') || $container.hasClass(this._dragClass),
    );

    log('Live2D 舞台创建完成');
    return true;
  },

  /**
   * 获取 PIXI Application 的 stage
   */
  getStage(): any {
    return this.app?.stage;
  },

  /**
   * 当前是否处于“预览挂载”状态（画布被挂到设置面板等容器内）
   */
  isPreviewMounted(): boolean {
    return this.mountMode === 'preview';
  },

  pushMount(mountEl: HTMLElement | null): boolean {
    if (!this.container || !this.app || !this.canvas) return false;
    if (!mountEl || !mountEl.isConnected) return false;

    const top = this._top();

    const rect = this.container.getBoundingClientRect?.();
    const width =
      rect?.width && rect.width > 0
        ? Math.round(rect.width)
        : Number(String(this.container.style.width || '').replace('px', '')) || 1;
    const height =
      rect?.height && rect.height > 0
        ? Math.round(rect.height)
        : Number(String(this.container.style.height || '').replace('px', '')) || 1;

    this.mountStack.push({
      parent: this.container.parentNode,
      nextSibling: this.container.nextSibling,
      styleText: this.container.style.cssText,
      width,
      height,
      onPositionChange: this._onPositionChange,
    });

    try {
      const pos = top.getComputedStyle(mountEl).position;
      if (pos === 'static') {
        mountEl.style.position = 'relative';
      }
    } catch {
      // ignore
    }

    // 预览态不应写入位置持久化
    this._onPositionChange = null;
    this._unbindWindowResize();

    try {
      mountEl.appendChild(this.container);
    } catch {
      return false;
    }

    this.mountMode = 'preview';
    this.container.style.cssText = `
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      z-index: 1;
      pointer-events: none;
      cursor: default;
      touch-action: none;
    `;

    try {
      const $container = $(this.container);
      const draggable = ($container as any).draggable;
      if (typeof draggable === 'function') {
        $container.draggable('disable');
      }
    } catch {
      // ignore
    }

    return true;
  },

  popMount(): { width: number; height: number } | null {
    if (!this.container || !this.app || !this.canvas) return null;
    const entry = this.mountStack.pop();
    if (!entry) return null;

    try {
      const parent = entry.parent;
      if (parent) {
        if (entry.nextSibling && entry.nextSibling.parentNode === parent) {
          parent.insertBefore(this.container, entry.nextSibling);
        } else {
          parent.appendChild(this.container);
        }
      } else {
        this._top().document.body.appendChild(this.container);
      }
    } catch {
      // ignore
    }

    this.container.style.cssText = entry.styleText;
    this._onPositionChange = entry.onPositionChange;
    this.mountMode = this.mountStack.length > 0 ? 'preview' : 'floating';

    try {
      const $container = $(this.container);
      const draggable = ($container as any).draggable;
      if (typeof draggable === 'function') {
        $container.draggable('enable');
      }
    } catch {
      // ignore
    }

    // 恢复窗口 resize clamp
    this._bindWindowResize({ width: entry.width, height: entry.height });

    const restore = this._pendingFloatingResize ?? { width: entry.width, height: entry.height };
    this._pendingFloatingResize = null;
    this.resize(restore.width, restore.height);

    return restore;
  },

  /**
   * 调整容器大小（浮窗模式）。若当前处于预览挂载，则延后到 popMount 后再应用。
   */
  resizeFloating(width: number, height: number): void {
    if (this.mountMode === 'preview') {
      this._pendingFloatingResize = { width, height };
      return;
    }

    if (this.container) {
      this.container.style.width = `${width}px`;
      this.container.style.height = `${height}px`;
      this._clampContainerToViewport({ width, height }, 'stage-resize');
    }
    if (this.app) {
      try {
        this.app.renderer.resize(width, height);
      } catch (e) {
        warn('renderer.resize 失败', e);
      }
    }
  },

  /**
   * 调整画布大小（预览模式，不改写容器的 width/height 样式）
   */
  resizePreview(width: number, height: number): void {
    if (this.mountMode !== 'preview') return;
    if (!this.app) return;
    try {
      this.app.renderer.resize(width, height);
    } catch (e) {
      warn('renderer.resize 失败', e);
    }
  },

  /**
   * 调整容器大小（兼容旧调用：等价于 resizeFloating）
   */
  resize(width: number, height: number): void {
    this.resizeFloating(width, height);
  },

  /**
   * 销毁舞台
   */
  destroy(): void {
    this.hideLoadingProgress();
    this._unbindWindowResize();
    this.mountStack = [];
    this.mountMode = 'floating';
    this._pendingFloatingResize = null;

    if (this.gestureRecognizer) {
      this.gestureRecognizer.destroy();
      this.gestureRecognizer = null;
    }

    if (this.app) {
      try {
        this.app.destroy(true);
      } catch (e) {
        warn('PIXI Application 销毁失败', e);
      }
      this.app = null;
    }
    if (this.container) {
      try {
        this.container.remove();
      } catch (e) {
        warn('舞台容器移除失败', e);
      }
      this.container = null;
    }
    this.canvas = null;
  },
};
