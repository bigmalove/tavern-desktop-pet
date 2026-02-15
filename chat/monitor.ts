import { log, warn } from '../utils/dom';
import type { CommentTriggerMode } from '../core/constants';

type MonitorCallback = () => void;
type StopHandle = { stop: () => void };
type UserSignalSource = 'message_sent' | 'generation_after_commands' | 'user_message_rendered';
type TriggerSource = 'user' | 'ai';

/**
 * Chat message monitor.
 * Uses event-gating to separate real user/AI turns from the plugin's own generateRaw flow.
 */
export const ChatMonitor = {
  /** Count since last trigger. */
  messageCount: 0,

  /** Ignore next N GENERATION_ENDED events (our own generateRaw). */
  ignoreNextCount: 0,

  /** Trigger callback. */
  _onTrigger: null as MonitorCallback | null,

  /** Event stop handles. */
  _stops: [] as StopHandle[],

  /** Latest user-side signal time (for dedupe). */
  _lastUserSignalAt: 0,

  /** Runtime config. */
  _config: {
    autoTrigger: true,
    triggerInterval: 3,
    triggerProbability: 60,
    commentTriggerMode: 'ai' as CommentTriggerMode,
  },

  init(
    config: {
      autoTrigger: boolean;
      triggerInterval: number;
      triggerProbability: number;
      commentTriggerMode: CommentTriggerMode;
    },
    onTrigger: MonitorCallback,
  ): void {
    this._config = { ...config };
    this._onTrigger = onTrigger;
    this._lastUserSignalAt = 0;

    const messageSentStop = this._bindEvent('MESSAGE_SENT', (_messageId: number) => {
      log('检测到用户发送消息(MESSAGE_SENT)');
      this._recordUserSignal('message_sent');
    });
    if (messageSentStop) {
      this._stops.push(messageSentStop);
    }

    // Fallback for environments where MESSAGE_SENT exists but does not fire.
    const userRenderedStop = this._bindEvent('USER_MESSAGE_RENDERED', (_messageId: number) => {
      log('检测到用户消息渲染(USER_MESSAGE_RENDERED)');
      this._recordUserSignal('user_message_rendered');
    });
    if (userRenderedStop) {
      this._stops.push(userRenderedStop);
    }

    // Fallback for some /send command paths.
    const afterCommandsStop = this._bindEvent(
      'GENERATION_AFTER_COMMANDS',
      (_type: string, option: { quiet_prompt?: string }, dryRun: boolean) => {
        if (dryRun) return;
        if (option?.quiet_prompt) return;
        log('检测到用户发送消息(GENERATION_AFTER_COMMANDS)');
        this._recordUserSignal('generation_after_commands');
      },
    );
    if (afterCommandsStop) {
      this._stops.push(afterCommandsStop);
    }

    const generationStartedStop = this._bindEvent(
      'GENERATION_STARTED',
      (_type: string, option: { quiet_prompt?: string }, dryRun: boolean) => {
        if (dryRun) return;
        if (option?.quiet_prompt) return;
      },
    );
    if (generationStartedStop) {
      this._stops.push(generationStartedStop);
    }

    const generationEndedStop = this._bindEvent('GENERATION_ENDED', (_messageId: number) => {
      if (this.ignoreNextCount > 0) {
        this.ignoreNextCount--;
        return;
      }
      this._handleTriggerCount('ai');
    });
    if (generationEndedStop) {
      this._stops.push(generationEndedStop);
    }

    log(
      `聊天监听器初始化完成(mode=${this._config.commentTriggerMode}, interval=${this._config.triggerInterval}, prob=${this._config.triggerProbability})`,
    );
  },

  _resolveEventName(eventKey: string): string | null {
    try {
      const top = window.parent ?? window;
      const fromSillyTavern = (top as any)?.SillyTavern?.eventTypes?.[eventKey];
      if (fromSillyTavern) return String(fromSillyTavern);
    } catch {
      // ignore
    }

    try {
      const fromLegacy = (tavern_events as any)?.[eventKey];
      if (fromLegacy) return String(fromLegacy);
    } catch {
      // ignore
    }

    return null;
  },

  _bindEvent(eventKey: string, handler: (...args: any[]) => void): StopHandle | null {
    const eventName = this._resolveEventName(eventKey);
    if (!eventName) {
      warn(`未找到可用事件: ${eventKey}`);
      return null;
    }

    try {
      const top = window.parent ?? window;
      const eventSource = (top as any)?.SillyTavern?.eventSource;
      if (eventSource && typeof eventSource.on === 'function') {
        eventSource.on(eventName, handler);
        log(`事件监听已绑定(${eventKey} -> ${eventName}, via eventSource)`);
        return {
          stop: () => {
            try {
              if (typeof eventSource.off === 'function') {
                eventSource.off(eventName, handler);
              }
            } catch {
              // ignore
            }
          },
        };
      }
    } catch {
      // ignore
    }

    if (typeof eventOn === 'function') {
      const stop = eventOn(eventName as any, handler);
      log(`事件监听已绑定(${eventKey} -> ${eventName}, via eventOn)`);
      return stop;
    }

    warn(`事件系统不可用，无法监听: ${eventKey}`);
    return null;
  },

  updateConfig(config: {
    autoTrigger: boolean;
    triggerInterval: number;
    triggerProbability: number;
    commentTriggerMode: CommentTriggerMode;
  }): void {
    this._config = { ...config };
  },

  _shouldCountBySource(source: TriggerSource): boolean {
    const mode = this._config.commentTriggerMode;
    return mode === 'both' || mode === source;
  },

  _recordUserSignal(source: UserSignalSource): void {
    const now = Date.now();

    // MESSAGE_SENT / USER_MESSAGE_RENDERED / GENERATION_AFTER_COMMANDS may fire in one send flow.
    if (now - this._lastUserSignalAt < 800) {
      log(`用户信号已去重(${source})`);
      return;
    }

    this._lastUserSignalAt = now;
    this._handleTriggerCount('user');
  },

  _handleTriggerCount(source: TriggerSource): void {
    if (!this._shouldCountBySource(source)) return;
    this.messageCount++;
    log(`消息计数(${source}): ${this.messageCount}`);
    this._checkAutoTrigger();
  },

  _checkAutoTrigger(): void {
    if (!this._config.autoTrigger || !this._onTrigger) return;
    if (this.messageCount < this._config.triggerInterval) return;

    const roll = Math.random() * 100;
    if (roll > this._config.triggerProbability) {
      log(`概率不满足(${roll.toFixed(1)} > ${this._config.triggerProbability})`);
      return;
    }

    this.messageCount = 0;
    log('自动触发吐槽');
    this._onTrigger();
  },

  manualTrigger(): void {
    if (!this._onTrigger) return;
    log('手动触发吐槽');
    this._onTrigger();
  },

  resetState(): void {
    this.messageCount = 0;
    this.ignoreNextCount = 0;
    this._lastUserSignalAt = 0;
    log('聊天监听状态已重置');
  },

  markSelfGeneration(): void {
    this.ignoreNextCount++;
  },

  destroy(): void {
    for (const s of this._stops) {
      s.stop();
    }
    this._stops = [];
    this._onTrigger = null;
    this.messageCount = 0;
    this.ignoreNextCount = 0;
    this._lastUserSignalAt = 0;
  },
};
