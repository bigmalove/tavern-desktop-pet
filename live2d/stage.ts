import { log, warn } from '../utils/dom';
import { GestureRecognizer, type GestureEvent } from '../utils/gesture-recognizer';
import { Live2DLoader } from './loader';

/**
 * Live2D PIXI 娓叉煋鑸炲彴
 * 鍦ㄩ厭棣嗛〉闈㈠垱寤?fixed 瀹氫綅鐨?canvas锛屾敮鎸佹嫋鎷藉拰缂╂斁
 */
export const Live2DStage = {
  app: null as any,
  canvas: null as HTMLCanvasElement | null,
  glContext: null as WebGLRenderingContext | WebGL2RenderingContext | null,
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
  interactionLayer: null as HTMLDivElement | null,
  gestureRecognizer: null as GestureRecognizer | null,
  _dragClass: 'desktop-pet-dragging',
  _minVisiblePx: 48,
  _interactionPaddingPx: 14,
  _alphaHitThreshold: 10,
  _maxPixelScanSamples: 360000,
  _onPositionChange: null as ((x: number, y: number) => void) | null,
  _boundWindowResize: null as (() => void) | null,
  _interactionSyncTimer: null as number | null,
  _pixelReadBuffer: null as Uint8Array | null,
  _lastClampLogAt: 0,

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

    // 榛樿浣嶇疆浣跨敤 right/bottom 鍥哄畾锛屾棤闇€鍦?resize 鏃跺啓鍏?left/top锛堥伩鍏嶆妸榛樿浣嶇疆鎸佷箙鍖栨垚鏁板€硷級
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

  _isRectFullyOutsideViewport(rect: DOMRect): boolean {
    const top = this._top();
    const viewportWidth = top.innerWidth || top.document.documentElement.clientWidth || 0;
    const viewportHeight = top.innerHeight || top.document.documentElement.clientHeight || 0;
    if (viewportWidth <= 0 || viewportHeight <= 0) return false;
    return rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewportWidth || rect.top >= viewportHeight;
  },

  _getVisibleAreaRatio(rect: DOMRect, viewportWidth: number, viewportHeight: number): number {
    const rectWidth = Number.isFinite(rect.width) ? rect.width : 0;
    const rectHeight = Number.isFinite(rect.height) ? rect.height : 0;
    if (rectWidth <= 0 || rectHeight <= 0) return 1;
    if (viewportWidth <= 0 || viewportHeight <= 0) return 1;

    const visibleLeft = Math.max(0, rect.left);
    const visibleTop = Math.max(0, rect.top);
    const visibleRight = Math.min(viewportWidth, rect.right);
    const visibleBottom = Math.min(viewportHeight, rect.bottom);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visibleArea = visibleWidth * visibleHeight;
    const totalArea = rectWidth * rectHeight;
    if (totalArea <= 0) return 1;

    return Math.max(0, Math.min(1, visibleArea / totalArea));
  },

  _clampPositionByAxis(value: number, size: number, viewportSize: number, minVisible: number): number {
    const safeSize = Number.isFinite(size) && size > 0 ? size : viewportSize;
    const safeViewport = Number.isFinite(viewportSize) && viewportSize > 0 ? viewportSize : safeSize;
    const safeMinVisible = Math.max(0, Math.min(minVisible, safeSize, safeViewport));
    const min = Math.min(0, -safeSize + safeMinVisible);
    const max = Math.max(0, safeViewport - safeMinVisible);
    const safeValue = Number.isFinite(value) ? value : 0;
    return Math.min(Math.max(safeValue, min), max);
  },

  _clampContainerToViewport(options: { width: number; height: number }, reason: string): void {
    if (!this.container) return;
    const rect = this.container.getBoundingClientRect();
    const size = this._getContainerRectSize(options);
    const top = this._top();
    const viewportWidth = top.innerWidth || top.document.documentElement.clientWidth || size.width;
    const viewportHeight = top.innerHeight || top.document.documentElement.clientHeight || size.height;
    const shouldClamp = this._shouldClampCurrentPosition();
    const fullyOutside = this._isRectFullyOutsideViewport(rect);
    const visibleRatio = this._getVisibleAreaRatio(rect, viewportWidth, viewportHeight);
    const isResizeClamp = reason.includes('resize');
    const forceFullVisible = (fullyOutside || isResizeClamp) && visibleRatio < 0.72;
    if (!shouldClamp && !fullyOutside && !forceFullVisible) return;

    const minVisibleX = forceFullVisible
      ? Math.min(size.width, viewportWidth)
      : Math.max(0, Math.min(this._minVisiblePx, size.width, viewportWidth));
    const minVisibleY = forceFullVisible
      ? Math.min(size.height, viewportHeight)
      : Math.max(0, Math.min(this._minVisiblePx, size.height, viewportHeight));

    const nextX = this._clampPositionByAxis(rect.left, size.width, viewportWidth, minVisibleX);
    const nextY = this._clampPositionByAxis(rect.top, size.height, viewportHeight, minVisibleY);
    const hasPositionChange = Math.abs(nextX - rect.left) > 0.5 || Math.abs(nextY - rect.top) > 0.5;
    if (!hasPositionChange) return;

    this.container.style.left = `${nextX}px`;
    this.container.style.top = `${nextY}px`;
    this.container.style.right = 'auto';
    this.container.style.bottom = 'auto';

    const now = Date.now();
    if (now - this._lastClampLogAt > 600) {
      this._lastClampLogAt = now;
      log(`窗口变化触发位置修正(${reason})`, {
        from: { x: rect.left, y: rect.top },
        to: { x: nextX, y: nextY },
        fullyOutside,
        visibleRatio,
        forceFullVisible,
      });
    }

    this._onPositionChange?.(nextX, nextY);
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
      warn('绑定 window.resize 监听失败', e);
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

  /** 鑾峰彇鐖剁獥鍙?*/
  _top(): Window {
    return window.parent ?? window;
  },

  /** 鑾峰彇 PIXI */
  _getPIXI(): any {
    const top = this._top();
    return Live2DLoader.getPixi(top);
  },

  _measureOpaqueBoundsFromCanvas(
    containerWidth: number,
    containerHeight: number,
  ): { left: number; top: number; width: number; height: number } | null {
    const gl = this.glContext;
    if (!gl) return null;

    const bufferWidth = gl.drawingBufferWidth;
    const bufferHeight = gl.drawingBufferHeight;
    if (bufferWidth <= 0 || bufferHeight <= 0) return null;

    const byteLength = bufferWidth * bufferHeight * 4;
    if (!this._pixelReadBuffer || this._pixelReadBuffer.length !== byteLength) {
      this._pixelReadBuffer = new Uint8Array(byteLength);
    }
    const pixels = this._pixelReadBuffer;

    try {
      gl.readPixels(0, 0, bufferWidth, bufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } catch {
      return null;
    }

    const scanStep = Math.max(1, Math.floor(Math.sqrt((bufferWidth * bufferHeight) / this._maxPixelScanSamples)));
    const alphaThreshold = Math.max(0, Math.min(255, this._alphaHitThreshold));

    let minX = bufferWidth;
    let minY = bufferHeight;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < bufferHeight; y += scanStep) {
      const rowOffset = y * bufferWidth * 4;
      for (let x = 0; x < bufferWidth; x += scanStep) {
        const alpha = pixels[rowOffset + x * 4 + 3];
        if (alpha <= alphaThreshold) continue;

        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < 0 || maxY < 0) return null;

    if (scanStep > 1) {
      maxX = Math.min(bufferWidth - 1, maxX + scanStep);
      maxY = Math.min(bufferHeight - 1, maxY + scanStep);
    }

    const scaleX = containerWidth / bufferWidth;
    const scaleY = containerHeight / bufferHeight;
    const left = Math.max(0, Math.floor(minX * scaleX));
    const right = Math.min(Math.ceil(containerWidth), Math.ceil((maxX + 1) * scaleX));
    const top = Math.max(0, Math.floor(containerHeight - (maxY + 1) * scaleY));
    const bottom = Math.min(Math.ceil(containerHeight), Math.ceil(containerHeight - minY * scaleY));
    const width = right - left;
    const height = bottom - top;
    if (width < 8 || height < 8) return null;

    return { left, top, width, height };
  },

  _syncInteractionLayerBounds(): void {
    if (!this.container || !this.interactionLayer) return;

    const layer = this.interactionLayer;
    const container = this.container;
    const disableLayer = () => {
      layer.style.left = '0px';
      layer.style.top = '0px';
      layer.style.width = '100%';
      layer.style.height = '100%';
      layer.style.pointerEvents = 'none';
      layer.style.cursor = 'default';
    };

    if (this.mountMode === 'preview') {
      disableLayer();
      return;
    }

    const rect = container.getBoundingClientRect();
    const containerWidth =
      rect.width > 0 ? rect.width : Number.parseFloat(String(container.style.width || '').replace('px', ''));
    const containerHeight =
      rect.height > 0 ? rect.height : Number.parseFloat(String(container.style.height || '').replace('px', ''));

    if (!Number.isFinite(containerWidth) || !Number.isFinite(containerHeight) || containerWidth <= 0 || containerHeight <= 0) {
      return;
    }

    const applyBounds = (left: number, top: number, width: number, height: number): boolean => {
      const padding = Math.max(0, this._interactionPaddingPx);
      const x1 = Math.max(0, Math.floor(left - padding));
      const y1 = Math.max(0, Math.floor(top - padding));
      const x2 = Math.min(Math.ceil(containerWidth), Math.ceil(left + width + padding));
      const y2 = Math.min(Math.ceil(containerHeight), Math.ceil(top + height + padding));
      const w = x2 - x1;
      const h = y2 - y1;
      if (w < 16 || h < 16) return false;

      layer.style.left = `${x1}px`;
      layer.style.top = `${y1}px`;
      layer.style.width = `${w}px`;
      layer.style.height = `${h}px`;
      layer.style.pointerEvents = 'auto';
      layer.style.cursor = 'pointer';
      return true;
    };

    const model = this.app?.stage?.children?.[0] as any;
    if (!model) {
      disableLayer();
      return;
    }

    const alphaBounds = this._measureOpaqueBoundsFromCanvas(containerWidth, containerHeight);
    if (alphaBounds) {
      const suspiciouslyHuge =
        alphaBounds.width >= containerWidth * 0.95 && alphaBounds.height >= containerHeight * 0.95;
      if (!suspiciouslyHuge && applyBounds(alphaBounds.left, alphaBounds.top, alphaBounds.width, alphaBounds.height)) {
        return;
      }
    }

    if (typeof model.getBounds === 'function') {
      try {
        const bounds = model.getBounds();
        const x = Number(bounds?.x);
        const y = Number(bounds?.y);
        const width = Number(bounds?.width);
        const height = Number(bounds?.height);
        const isValid =
          Number.isFinite(x) &&
          Number.isFinite(y) &&
          Number.isFinite(width) &&
          Number.isFinite(height) &&
          width > 0 &&
          height > 0;
        if (isValid) {
          const suspiciouslyHuge = width >= containerWidth * 0.95 && height >= containerHeight * 0.95;
          if (!suspiciouslyHuge && applyBounds(x, y, width, height)) {
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    const fallbackWidth = Math.max(80, Math.round(containerWidth * 0.62));
    const fallbackHeight = Math.max(120, Math.round(containerHeight * 0.88));
    const fallbackLeft = Math.max(0, Math.round((containerWidth - fallbackWidth) / 2));
    const fallbackTop = Math.max(0, Math.round(containerHeight - fallbackHeight));
    if (!applyBounds(fallbackLeft, fallbackTop, fallbackWidth, fallbackHeight)) {
      disableLayer();
      return;
    }
  },

  _startInteractionSyncTimer(): void {
    this._stopInteractionSyncTimer();
    this._syncInteractionLayerBounds();
    this._interactionSyncTimer = window.setInterval(() => {
      this._syncInteractionLayerBounds();
    }, 250);
  },

  _stopInteractionSyncTimer(): void {
    if (this._interactionSyncTimer === null) return;
    window.clearInterval(this._interactionSyncTimer);
    this._interactionSyncTimer = null;
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
    const dragTarget = this.interactionLayer ?? container;
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

    dragTarget.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      if (state.pointerId !== null) return;

      state.pointerId = e.pointerId;
      state.startClientX = e.clientX;
      state.startClientY = e.clientY;

      const { left, top } = getRectLeftTop();
      state.startLeft = left;
      state.startTop = top;

      try {
        dragTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    });

    dragTarget.addEventListener('pointermove', (e: PointerEvent) => {
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
        dragTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      // iOS 鍦?pointerup 鍚庡彲鑳藉嚭鐜扮矘婊炵偣鍑伙紝杩欓噷寤惰繜娓呴櫎 selection
      try {
        top.getSelection?.()?.removeAllRanges?.();
      } catch {
        // ignore
      }
    };

    dragTarget.addEventListener('pointerup', onPointerUp);
    dragTarget.addEventListener('pointercancel', onPointerUp);
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
    text.textContent = '姝ｅ湪鍔犺浇妯″瀷 (0%)';

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
        warn('Failed to remove loading progress overlay', e);
      }
    }
    this.loadingOverlay = null;
    this.loadingText = null;
    this.loadingBarFill = null;
  },

  /**
   * 鍒涘缓娓叉煋瀹瑰櫒鍜?PIXI Application
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
      warn('PIXI 尚未就绪，无法创建舞台');
      return false;
    }

    // 闃叉鑴氭湰鐑噸杞芥垨閲嶅鍒濆鍖栨椂娈嬬暀澶氫釜鑸炲彴
    this.destroy();
    this._onPositionChange = options.onPositionChange ?? null;
    this._bindWindowResize({ width: options.width, height: options.height });
    const stale = top.document.getElementById('desktop-pet-stage');
    if (stale) stale.remove();

    // 鍒涘缓瀹瑰櫒 div
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
      pointer-events: none;
      cursor: default;
      touch-action: none;
    `;

    // Apply persisted position.
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

    // 鍒涘缓 canvas
    this.canvas = top.document.createElement('canvas');
    this.canvas.style.cssText = 'width: 100%; height: 100%; pointer-events: none;';
    this.container.appendChild(this.canvas);

    this.interactionLayer = top.document.createElement('div');
    this.interactionLayer.className = 'desktop-pet-interaction-layer';
    this.interactionLayer.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      pointer-events: auto;
      cursor: pointer;
      touch-action: none;
      z-index: 4;
    `;
    this.container.appendChild(this.interactionLayer);

    // 鍒涘缓 PIXI Application
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
      warn('WebGL is unavailable');
      return false;
    }
    this.glContext = glContext as WebGLRenderingContext | WebGL2RenderingContext;
    this._pixelReadBuffer = null;

    try {
      const attrs = (glContext as WebGLRenderingContext | WebGL2RenderingContext).getContextAttributes?.();
      if (attrs && attrs.stencil === false) {
        warn('Current WebGL context has no stencil buffer; mask rendering may be abnormal');
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

    // 浣跨敤 jQueryUI 瀹炵幇鎷栨嫿
    const $container = $(this.container);
    const draggable = ($container as any).draggable;
    if (typeof draggable === 'function') {
      try {
        $container.draggable({
          handle: '.desktop-pet-interaction-layer',
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
        warn('Failed to initialize jQueryUI draggable, fallback to native pointer drag', e);
        this._enablePointerDrag($container, {
          width: options.width,
          height: options.height,
          onPositionChange: options.onPositionChange,
        });
      }
    } else {
      warn('jQueryUI draggable not found, fallback to native pointer drag');
      this._enablePointerDrag($container, {
        width: options.width,
        height: options.height,
        onPositionChange: options.onPositionChange,
      });
    }

    // 榧犳爣婊氳疆缂╂斁
    const interactionTarget = this.interactionLayer ?? this.container;
    interactionTarget.addEventListener('wheel', (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newScale = Math.max(0.1, Math.min(3, options.scale + delta));
      options.scale = newScale;
      options.onScaleChange?.(newScale);
    }, { passive: false });

    // Gesture recognizer (replaces raw click handler).
    this.gestureRecognizer = new GestureRecognizer(
      interactionTarget,
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
    this._startInteractionSyncTimer();

    log('Live2D 舞台创建完成');
    return true;
  },

  /**
   * 鑾峰彇 PIXI Application 鐨?stage
   */
  getStage(): any {
    return this.app?.stage;
  },

  /**
   * 褰撳墠鏄惁澶勪簬鈥滈瑙堟寕杞解€濈姸鎬侊紙鐢诲竷琚寕鍒拌缃潰鏉跨瓑瀹瑰櫒鍐咃級
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

    // 棰勮鎬佷笉搴斿啓鍏ヤ綅缃寔涔呭寲
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
    if (this.interactionLayer) {
      this.interactionLayer.style.left = '0px';
      this.interactionLayer.style.top = '0px';
      this.interactionLayer.style.width = '100%';
      this.interactionLayer.style.height = '100%';
      this.interactionLayer.style.pointerEvents = 'none';
      this.interactionLayer.style.cursor = 'default';
    }

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
    this._syncInteractionLayerBounds();

    try {
      const $container = $(this.container);
      const draggable = ($container as any).draggable;
      if (typeof draggable === 'function') {
        $container.draggable('enable');
      }
    } catch {
      // ignore
    }

    // 鎭㈠绐楀彛 resize clamp
    this._bindWindowResize({ width: entry.width, height: entry.height });

    const restore = this._pendingFloatingResize ?? { width: entry.width, height: entry.height };
    this._pendingFloatingResize = null;
    this.resize(restore.width, restore.height);

    return restore;
  },

  /**
   * 璋冩暣瀹瑰櫒澶у皬锛堟诞绐楁ā寮忥級銆傝嫢褰撳墠澶勪簬棰勮鎸傝浇锛屽垯寤跺悗鍒?popMount 鍚庡啀搴旂敤銆?   */
  resizeFloating(width: number, height: number): void {
    if (this.mountMode === 'preview') {
      this._pendingFloatingResize = { width, height };
      return;
    }

    if (this.container) {
      this.container.style.width = `${width}px`;
      this.container.style.height = `${height}px`;
      this._clampContainerToViewport({ width, height }, 'stage-resize');
      this._syncInteractionLayerBounds();
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
   * 璋冩暣鐢诲竷澶у皬锛堥瑙堟ā寮忥紝涓嶆敼鍐欏鍣ㄧ殑 width/height 鏍峰紡锛?   */
  resizePreview(width: number, height: number): void {
    if (this.mountMode !== 'preview') return;
    if (!this.app) return;
    try {
      this.app.renderer.resize(width, height);
      this._syncInteractionLayerBounds();
    } catch (e) {
      warn('renderer.resize 失败', e);
    }
  },

  /**
   * 璋冩暣瀹瑰櫒澶у皬锛堝吋瀹规棫璋冪敤锛氱瓑浠蜂簬 resizeFloating锛?   */
  resize(width: number, height: number): void {
    this.resizeFloating(width, height);
  },

  /**
   * 閿€姣佽垶鍙?   */
  destroy(): void {
    this.hideLoadingProgress();
    this._unbindWindowResize();
    this._stopInteractionSyncTimer();
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
        warn('Failed to destroy PIXI Application', e);
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
    this.interactionLayer = null;
    this.canvas = null;
    this.glContext = null;
    this._pixelReadBuffer = null;
  },
};

