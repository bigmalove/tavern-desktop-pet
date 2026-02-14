/**
 * 手势识别器
 * 在 jQueryUI draggable 环境下识别 单击/双击/长按 手势，防止误触发 LLM
 * 拖拽由 jQueryUI draggable 处理，本模块不干预
 *
 * 状态机：
 * IDLE → pointerdown → PENDING
 * PENDING → 移动 > 阈值 → IDLE（拖拽，交给 jQueryUI）
 * PENDING → longPressDelay 无移动 → LONG_PRESS → IDLE
 * PENDING → pointerup → WAIT_DOUBLE
 * WAIT_DOUBLE → doubleClickWindow 内再次 pointerdown+up → DOUBLE_TAP → IDLE
 * WAIT_DOUBLE → 超时 → TAP → IDLE
 */

export type GestureType = 'tap' | 'double-tap' | 'long-press';

export interface GestureEvent {
  type: GestureType;
  clientX: number;
  clientY: number;
}

export interface GestureConfig {
  /** 长按判定时间(ms) */
  longPressDelay: number;
  /** 双击间隔窗口(ms) */
  doubleClickWindow: number;
  /** 移动距离阈值(px)，超过则视为拖拽 */
  moveThreshold: number;
}

const DEFAULT_CONFIG: GestureConfig = {
  longPressDelay: 500,
  doubleClickWindow: 300,
  moveThreshold: 8,
};

function isTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

export class GestureRecognizer {
  private element: HTMLElement;
  private config: GestureConfig;
  private onGesture: (event: GestureEvent) => void;
  private isDraggingCheck: () => boolean;

  private state: 'idle' | 'pending' | 'wait-double' = 'idle';
  private startPos = { x: 0, y: 0 };
  private longPressTimer: number | null = null;
  private doubleClickTimer: number | null = null;
  private longPressFired = false;
  private moved = false;
  private destroyed = false;

  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;
  private boundPointerUp: (e: PointerEvent) => void;
  private boundContextMenu: (e: Event) => void;

  /**
   * @param element 绑定手势的目标元素
   * @param config 配置（可选）
   * @param onGesture 手势回调
   * @param isDraggingCheck 外部拖拽状态检查（用于判断 jQueryUI draggable 是否正在拖拽）
   */
  constructor(
    element: HTMLElement,
    config: Partial<GestureConfig>,
    onGesture: (event: GestureEvent) => void,
    isDraggingCheck: () => boolean = () => false,
  ) {
    this.element = element;
    this.config = {
      ...DEFAULT_CONFIG,
      moveThreshold: isTouchDevice() ? 12 : 8,
      ...config,
    };
    this.onGesture = onGesture;
    this.isDraggingCheck = isDraggingCheck;

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    this.boundPointerUp = this.handlePointerUp.bind(this);
    this.boundContextMenu = (e: Event) => e.preventDefault();

    element.addEventListener('pointerdown', this.boundPointerDown);
    element.addEventListener('pointermove', this.boundPointerMove);
    element.addEventListener('pointerup', this.boundPointerUp);
    element.addEventListener('pointercancel', this.boundPointerUp);
    element.addEventListener('contextmenu', this.boundContextMenu);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearAllTimers();
    this.element.removeEventListener('pointerdown', this.boundPointerDown);
    this.element.removeEventListener('pointermove', this.boundPointerMove);
    this.element.removeEventListener('pointerup', this.boundPointerUp);
    this.element.removeEventListener('pointercancel', this.boundPointerUp);
    this.element.removeEventListener('contextmenu', this.boundContextMenu);
  }

  private handlePointerDown(_e: PointerEvent): void {
    if (this.destroyed) return;

    this.startPos = { x: _e.clientX, y: _e.clientY };
    this.longPressFired = false;
    this.moved = false;

    if (this.state === 'wait-double') {
      // 双击序列中的第二次按下，等 pointerup 确认
      return;
    }

    this.state = 'pending';
    this.clearLongPressTimer();

    this.longPressTimer = window.setTimeout(() => {
      if (this.state === 'pending' && !this.moved && !this.isDraggingCheck()) {
        this.longPressFired = true;
        this.state = 'idle';
        this.onGesture({
          type: 'long-press',
          clientX: this.startPos.x,
          clientY: this.startPos.y,
        });
      }
    }, this.config.longPressDelay);
  }

  private handlePointerMove(_e: PointerEvent): void {
    if (this.destroyed || this.state !== 'pending') return;

    const dx = _e.clientX - this.startPos.x;
    const dy = _e.clientY - this.startPos.y;

    if (Math.sqrt(dx * dx + dy * dy) > this.config.moveThreshold) {
      // 移动超过阈值 → 取消长按，进入 idle（拖拽由 jQueryUI 处理）
      this.moved = true;
      this.clearLongPressTimer();
      this.state = 'idle';
    }
  }

  private handlePointerUp(_e: PointerEvent): void {
    if (this.destroyed) return;
    this.clearLongPressTimer();

    // 正在拖拽（jQueryUI 或自身检测到移动）→ 不触发任何手势
    if (this.moved || this.isDraggingCheck()) {
      this.state = 'idle';
      return;
    }

    // 长按已触发 → 直接回 idle
    if (this.longPressFired) {
      this.state = 'idle';
      return;
    }

    if (this.state === 'wait-double') {
      // 双击确认（第二次抬起）
      this.clearDoubleClickTimer();
      this.state = 'idle';
      this.onGesture({
        type: 'double-tap',
        clientX: _e.clientX,
        clientY: _e.clientY,
      });
      return;
    }

    if (this.state === 'pending' && !this.moved) {
      // 第一次抬起 → 进入等待双击阶段
      this.state = 'wait-double';
      const x = _e.clientX;
      const y = _e.clientY;
      this.doubleClickTimer = window.setTimeout(() => {
        // 超时 → 判定为单击
        this.state = 'idle';
        this.onGesture({ type: 'tap', clientX: x, clientY: y });
      }, this.config.doubleClickWindow);
    }
  }

  private clearLongPressTimer(): void {
    if (this.longPressTimer !== null) {
      window.clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }

  private clearDoubleClickTimer(): void {
    if (this.doubleClickTimer !== null) {
      window.clearTimeout(this.doubleClickTimer);
      this.doubleClickTimer = null;
    }
  }

  private clearAllTimers(): void {
    this.clearLongPressTimer();
    this.clearDoubleClickTimer();
  }
}
