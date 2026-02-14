import { log, warn } from '../utils/dom';

type MonitorCallback = () => void;

/**
 * 聊天消息监听器
 * 参考骰子系统的 generationGate 模式，精确区分用户真实发送 vs 后台/插件生成
 */
export const ChatMonitor = {
  /** 每次非自身的 GENERATION_ENDED 触发后的消息计数 */
  messageCount: 0,

  /** 忽略下 N 次 GENERATION_ENDED（我们自己的 generateRaw 触发的） */
  ignoreNextCount: 0,

  /** 吐槽回调 */
  _onTrigger: null as MonitorCallback | null,

  /** 事件监听停止句柄 */
  _stops: [] as Array<{ stop: () => void }>,

  /** 配置 */
  _config: {
    autoTrigger: true,
    triggerInterval: 3,
    triggerProbability: 60,
  },

  /**
   * 初始化监听
   */
  init(
    config: {
      autoTrigger: boolean;
      triggerInterval: number;
      triggerProbability: number;
    },
    onTrigger: MonitorCallback,
  ): void {
    this._config = { ...config };
    this._onTrigger = onTrigger;

    // 监听 MESSAGE_SENT — 用户发送消息
    this._stops.push(
      eventOn(tavern_events.MESSAGE_SENT, (_messageId: number) => {
        log('检测到用户发送消息');
      }),
    );

    // 监听 GENERATION_STARTED — 记录生成上下文
    this._stops.push(
      eventOn(tavern_events.GENERATION_STARTED, (
        _type: string,
        option: { quiet_prompt?: string },
        dryRun: boolean,
      ) => {
        // 过滤 dryRun
        if (dryRun) return;
        // 过滤静默/后台生成（quiet_prompt 存在时说明是后台调用）
        if (option?.quiet_prompt) return;
      }),
    );

    // 监听 GENERATION_ENDED — AI 生成结束，判断是否触发吐槽
    this._stops.push(
      eventOn(tavern_events.GENERATION_ENDED, (_messageId: number) => {
        // 检查是否是自身的 generateRaw 触发的
        if (this.ignoreNextCount > 0) {
          this.ignoreNextCount--;
          return;
        }

        this.messageCount++;
        log(`消息计数: ${this.messageCount}`);
        this._checkAutoTrigger();
      }),
    );

    log('聊天监听器初始化完成');
  },

  /**
   * 更新配置
   */
  updateConfig(config: {
    autoTrigger: boolean;
    triggerInterval: number;
    triggerProbability: number;
  }): void {
    this._config = { ...config };
  },

  /**
   * 检查是否满足自动触发条件
   */
  _checkAutoTrigger(): void {
    if (!this._config.autoTrigger || !this._onTrigger) return;

    // 检查间隔
    if (this.messageCount < this._config.triggerInterval) return;

    // 检查概率
    const roll = Math.random() * 100;
    if (roll > this._config.triggerProbability) {
      log(`概率不满足 (${roll.toFixed(1)} > ${this._config.triggerProbability})`);
      return;
    }

    // 重置计数并触发
    this.messageCount = 0;
    log('自动触发吐槽');
    this._onTrigger();
  },

  /**
   * 手动触发吐槽
   */
  manualTrigger(): void {
    if (this._onTrigger) {
      log('手动触发吐槽');
      this._onTrigger();
    }
  },

  /**
   * 聊天切换时重置监听状态
   */
  resetState(): void {
    this.messageCount = 0;
    this.ignoreNextCount = 0;
    log('聊天监听状态已重置');
  },

  /**
   * 标记即将进行一次 generateRaw 调用
   * 调用后对应的 GENERATION_ENDED 会被忽略
   */
  markSelfGeneration(): void {
    this.ignoreNextCount++;
  },

  /**
   * 清理监听
   */
  destroy(): void {
    for (const s of this._stops) {
      s.stop();
    }
    this._stops = [];
    this._onTrigger = null;
    this.messageCount = 0;
    this.ignoreNextCount = 0;
  },
};
