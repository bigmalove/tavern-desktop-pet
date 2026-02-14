import { useSettingsStore } from '../core/settings';
import { error, log, warn } from '../utils/dom';
import { ChatMonitor } from './monitor';
import { buildChatPrompt, buildPrompt } from './prompt-templates';

/** 吐槽结果回调 */
type CommentCallback = (text: string, isDone: boolean) => void;

/**
 * 吐槽生成器
 * 调用 LLM 生成吐槽评论
 */
export const Commentator = {
  /** 是否正在生成 */
  isGenerating: false,

  /** 结果回调 */
  _onComment: null as CommentCallback | null,

  /** 流式监听停止句柄 */
  _streamStop: null as { stop: () => void } | null,
  _latestStreamText: '',

  /**
   * 设置评论结果回调
   */
  setCallback(cb: CommentCallback): void {
    this._onComment = cb;
  },

  /**
   * 触发吐槽生成
   */
  async generate(): Promise<void> {
    if (this.isGenerating) {
      log('已有生成任务进行中，跳过');
      return;
    }

    this.isGenerating = true;
    log('开始生成吐槽');

    try {
      const store = useSettingsStore();
      const s = store.settings;

      // 获取最近聊天记录
      const chatMessages = this._getChatContext(s.maxChatContext);
      if (chatMessages.length === 0) {
        log('没有可用的聊天记录，跳过吐槽');
        return;
      }

      // 构建提示词
      const { system, user } = buildPrompt(s.commentStyle, s.customPrompt, chatMessages, !!s.emotionCotEnabled);

      // 标记自身生成，防止 GENERATION_ENDED 误触发
      ChatMonitor.markSelfGeneration();
      this._latestStreamText = '';

      let result: string;

      if (s.apiMode === 'custom' && s.apiConfig.url) {
        // 自定义 API 模式
        result = await this._generateCustom(system, user, s.apiConfig);
      } else {
        // 酒馆主 API 模式
        result = await this._generateTavern(system, user, s.apiConfig.max_tokens, s.apiConfig.temperature);
      }

      const finalText = String(result || '').trim() || String(this._latestStreamText || '').trim();
      if (finalText) {
        this._onComment?.(finalText, true);
      } else {
        warn('吐槽生成结果为空');
      }
    } catch (e) {
      error('吐槽生成失败:', e);
    } finally {
      this.isGenerating = false;
    }
  },

  /**
   * 手动聊天（从功能菜单输入框触发）
   * - 会读取最近聊天上下文作为参考（与吐槽一致）
   * - 使用同一套 API 配置（酒馆主 API / 自定义 API）
   */
  async chat(userMessage: string): Promise<void> {
    const input = String(userMessage || '').trim();
    if (!input) return;

    if (this.isGenerating) {
      log('已有生成任务进行中，跳过');
      return;
    }

    this.isGenerating = true;
    log('开始手动聊天生成');

    try {
      const store = useSettingsStore();
      const s = store.settings;

      const chatMessages = this._getChatContext(s.maxChatContext);
      const { system, user } = buildChatPrompt(
        s.commentStyle,
        s.customPrompt,
        chatMessages,
        input,
        !!s.emotionCotEnabled,
      );

      // 标记自身生成，防止 GENERATION_ENDED 误触发
      ChatMonitor.markSelfGeneration();
      this._latestStreamText = '';

      let result: string;
      if (s.apiMode === 'custom' && s.apiConfig.url) {
        result = await this._generateCustom(system, user, s.apiConfig);
      } else {
        result = await this._generateTavern(system, user, s.apiConfig.max_tokens, s.apiConfig.temperature);
      }

      const finalText = String(result || '').trim() || String(this._latestStreamText || '').trim();
      if (finalText) {
        this._onComment?.(finalText, true);
      } else {
        warn('手动聊天生成结果为空');
      }
    } catch (e) {
      error('聊天生成失败:', e);
    } finally {
      this.isGenerating = false;
    }
  },

  /**
   * 使用酒馆主 API (generateRaw) 生成
   */
  async _generateTavern(
    system: string,
    user: string,
    maxTokens: number,
    temperature: number,
  ): Promise<string> {
    // 设置流式监听
    this._setupStreamListener();
    try {
      return await generateRaw({
        should_silence: true,
        should_stream: true,
        ordered_prompts: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        custom_api: undefined,
      });
    } finally {
      this._cleanupStreamListener();
    }
  },

  /**
   * 使用自定义 API 生成
   */
  async _generateCustom(
    system: string,
    user: string,
    apiConfig: {
      url: string;
      apiKey: string;
      model: string;
      source: string;
      max_tokens: number;
      temperature: number;
      frequency_penalty: number;
      presence_penalty: number;
      top_p: number;
      top_k: number;
      usePresetSampling: boolean;
    },
  ): Promise<string> {
    // 设置流式监听
    this._setupStreamListener();

    try {
      const usePreset = apiConfig.usePresetSampling;
      const is422Error = (err: unknown): boolean => {
        const msg = err instanceof Error ? err.message : String(err);
        return /\b422\b/.test(msg);
      };

      const baseCustomApi = {
        apiurl: String(apiConfig.url || '').trim(),
        key: String(apiConfig.apiKey || '').trim() || undefined,
        model: String(apiConfig.model || '').trim(),
        source: String(apiConfig.source || 'openai').trim() || 'openai',
      };

      if (!baseCustomApi.model) {
        throw new Error('自定义 API 模型不能为空，请先在设置中填写或选择模型。');
      }

      const requestWithCustomApi = async (customApi: {
        apiurl: string;
        key?: string;
        model: string;
        source: string;
        max_tokens?: 'same_as_preset' | 'unset' | number;
        temperature?: 'same_as_preset' | 'unset' | number;
        frequency_penalty?: 'same_as_preset' | 'unset' | number;
        presence_penalty?: 'same_as_preset' | 'unset' | number;
        top_p?: 'same_as_preset' | 'unset' | number;
        top_k?: 'same_as_preset' | 'unset' | number;
      }): Promise<string> => {
        return generateRaw({
          should_silence: true,
          should_stream: true,
          custom_api: customApi,
          ordered_prompts: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        });
      };

      const fullCustomApi = {
        ...baseCustomApi,
        max_tokens: usePreset ? ('same_as_preset' as const) : apiConfig.max_tokens,
        temperature: usePreset ? ('same_as_preset' as const) : apiConfig.temperature,
        frequency_penalty: usePreset ? ('same_as_preset' as const) : apiConfig.frequency_penalty,
        presence_penalty: usePreset ? ('same_as_preset' as const) : apiConfig.presence_penalty,
        top_p: usePreset ? ('same_as_preset' as const) : apiConfig.top_p,
        top_k: usePreset ? ('same_as_preset' as const) : apiConfig.top_k,
      };

      // 兼容常见 OpenAI 兼容后端：禁用最容易触发 422 的参数。
      const safeCustomApi = {
        ...baseCustomApi,
        max_tokens: usePreset ? ('same_as_preset' as const) : apiConfig.max_tokens,
        temperature: usePreset ? ('same_as_preset' as const) : apiConfig.temperature,
        frequency_penalty: 'unset' as const,
        presence_penalty: 'unset' as const,
        top_p: usePreset ? ('same_as_preset' as const) : apiConfig.top_p,
        top_k: 'unset' as const,
      };

      const minimalCustomApi = {
        ...baseCustomApi,
        max_tokens: 'unset' as const,
        temperature: 'unset' as const,
        frequency_penalty: 'unset' as const,
        presence_penalty: 'unset' as const,
        top_p: 'unset' as const,
        top_k: 'unset' as const,
      };

      const attempts: Array<{
        name: string;
        customApi: typeof fullCustomApi;
      }> = [
        { name: 'full', customApi: fullCustomApi },
        { name: 'safe', customApi: safeCustomApi },
      ];

      if (baseCustomApi.source !== 'openai') {
        attempts.push({ name: 'safe-openai', customApi: { ...safeCustomApi, source: 'openai' } });
      }

      attempts.push({ name: 'minimal', customApi: minimalCustomApi });

      if (baseCustomApi.source !== 'openai') {
        attempts.push({
          name: 'minimal-openai',
          customApi: { ...minimalCustomApi, source: 'openai' },
        });
      }

      let lastError: unknown = null;

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        try {
          if (i > 0) {
            warn(`自定义 API 参数回退重试：${attempt.name}`);
          }
          return await requestWithCustomApi(attempt.customApi);
        } catch (e) {
          lastError = e;
          const canRetry = is422Error(e) && i < attempts.length - 1;
          if (!canRetry) throw e;
          const next = attempts[i + 1];
          warn(`自定义 API 返回 422，准备继续回退参数（${attempt.name} -> ${next.name}）`);
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    } finally {
      this._cleanupStreamListener();
    }
  },

  /**
   * 设置流式传输监听器
   */
  _setupStreamListener(): void {
    this._cleanupStreamListener();
    this._streamStop = eventOn(
      iframe_events.STREAM_TOKEN_RECEIVED_FULLY,
      (fullText: string) => {
        this._latestStreamText = String(fullText || '');
        this._onComment?.(fullText, false);
      },
    );
  },

  /**
   * 清理流式传输监听器
   */
  _cleanupStreamListener(): void {
    if (this._streamStop) {
      this._streamStop.stop();
      this._streamStop = null;
    }
  },

  /**
   * 获取聊天上下文
   */
  _getChatContext(maxCount: number): Array<{ role: string; name: string; message: string }> {
    try {
      const messages = getChatMessages(`0-{{lastMessageId}}`, {
        role: 'all',
        hide_state: 'unhidden',
      });

      // 取最后 N 条
      const recent = messages.slice(-maxCount);

      return recent.map((msg) => ({
        role: msg.role,
        name: msg.name,
        message: msg.message,
      }));
    } catch (e) {
      warn('获取聊天记录失败:', e);
      return [];
    }
  },

  /**
   * 清理
   */
  destroy(): void {
    this._cleanupStreamListener();
    this._onComment = null;
    this._latestStreamText = '';
    this.isGenerating = false;
  },
};
