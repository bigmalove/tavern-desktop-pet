import { useSettingsStore } from '../core/settings';
import { error, log, warn } from '../utils/dom';
import { ChatMonitor } from './monitor';
import { buildChatPrompt, buildPrompt } from './prompt-templates';

type CommentCallback = (text: string, isDone: boolean) => void;

/**
 * 吐槽生成器
 * 调用 LLM 生成吐槽/聊天文案，并通过回调把流式结果传给 UI。
 */
export const Commentator = {
  isGenerating: false,

  _onComment: null as CommentCallback | null,
  _streamStop: null as { stop: () => void } | null,
  _latestStreamText: '',

  setCallback(cb: CommentCallback): void {
    this._onComment = cb;
  },

  async generate(): Promise<void> {
    if (this.isGenerating) {
      log('已有生成任务进行中，跳过');
      return;
    }

    this.isGenerating = true;
    log('开始生成吐槽');
    let emittedDone = false;

    try {
      this._onComment?.('', false);

      const store = useSettingsStore();
      const s = store.settings;

      const chatMessages = this._getChatContext(s.maxChatContext);
      if (chatMessages.length === 0) {
        log('没有可用的聊天记录，跳过吐槽');
        return;
      }

      const { system, user } = buildPrompt(s.commentStyle, s.customPrompt, chatMessages, !!s.emotionCotEnabled);

      this._latestStreamText = '';
      let result: string;

      if (s.apiMode === 'custom' && s.apiConfig.url) {
        result = await this._generateCustom(system, user, s.apiConfig);
      } else {
        ChatMonitor.markSelfGeneration();
        result = await this._generateTavern(
          system,
          user,
          s.apiConfig.max_tokens,
          s.apiConfig.temperature,
          !!s.apiConfig.sendWorldInfo,
        );
      }

      const finalText = String(result || '').trim() || String(this._latestStreamText || '').trim();
      if (finalText) {
        this._onComment?.(finalText, true);
        emittedDone = true;
      } else {
        warn('吐槽生成结果为空');
      }
    } catch (e) {
      error('吐槽生成失败:', e);
    } finally {
      if (!emittedDone) {
        this._onComment?.('', true);
      }
      this.isGenerating = false;
    }
  },

  /**
   * 手动聊天（从功能菜单输入框触发）
   * - 会读取最近聊天上下文作为参考（与吐槽一致）
   * - 使用相同 API 配置（酒馆主 API / 自定义 API）
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
    let emittedDone = false;

    try {
      this._onComment?.('', false);

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

      this._latestStreamText = '';
      let result: string;

      if (s.apiMode === 'custom' && s.apiConfig.url) {
        result = await this._generateCustom(system, user, s.apiConfig);
      } else {
        ChatMonitor.markSelfGeneration();
        result = await this._generateTavern(
          system,
          user,
          s.apiConfig.max_tokens,
          s.apiConfig.temperature,
          !!s.apiConfig.sendWorldInfo,
        );
      }

      const finalText = String(result || '').trim() || String(this._latestStreamText || '').trim();
      if (finalText) {
        this._onComment?.(finalText, true);
        emittedDone = true;
      } else {
        warn('手动聊天生成结果为空');
      }
    } catch (e) {
      error('聊天生成失败:', e);
    } finally {
      if (!emittedDone) {
        this._onComment?.('', true);
      }
      this.isGenerating = false;
    }
  },

  async _generateTavern(
    system: string,
    user: string,
    maxTokens: number,
    temperature: number,
    sendWorldInfo: boolean,
  ): Promise<string> {
    this._setupStreamListener();
    const orderedPrompts: Array<
      'world_info_before' | 'world_info_after' | { role: 'system' | 'assistant' | 'user'; content: string }
    > = sendWorldInfo
      ? ['world_info_before', { role: 'system', content: system }, 'world_info_after', { role: 'user', content: user }]
      : [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ];

    try {
      return await generateRaw({
        should_silence: true,
        should_stream: true,
        ordered_prompts: orderedPrompts,
        custom_api: undefined,
      });
    } finally {
      this._cleanupStreamListener();
    }
  },

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
      sendWorldInfo?: boolean;
    },
  ): Promise<string> {
    const apiUrl = String(apiConfig.url || '').trim();
    const apiKey = String(apiConfig.apiKey || '').trim();
    const model = String(apiConfig.model || '')
      .trim()
      .replace(/^models\//, '');

    if (!apiUrl) {
      throw new Error('自定义 API URL 不能为空。');
    }
    if (!model) {
      throw new Error('自定义 API 模型不能为空，请先在设置中填写或选择模型。');
    }

    const usePreset = !!apiConfig.usePresetSampling;
    const sendWorldInfo = !!apiConfig.sendWorldInfo;
    const requestUrl = '/api/backends/chat-completions/generate';
    const orderedPrompts = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    const buildAttemptBody = (attempt: 'full' | 'safe' | 'minimal') => {
      const body: Record<string, unknown> = {
        messages: orderedPrompts,
        model,
        stream: false,
        chat_completion_source: 'custom',
        custom_prompt_post_processing: sendWorldInfo ? 'strict' : 'none',
        reverse_proxy: apiUrl,
        custom_url: apiUrl,
        custom_include_headers: apiKey ? `Authorization: Bearer ${apiKey}` : '',
      };

      // 分级回退请求参数，尽量兼容不同 OpenAI 兼容后端。
      if (!usePreset && attempt !== 'minimal') {
        body.max_tokens = apiConfig.max_tokens;
        body.temperature = apiConfig.temperature;
        body.top_p = apiConfig.top_p;
      }

      if (!usePreset && attempt === 'full') {
        body.frequency_penalty = apiConfig.frequency_penalty;
        body.presence_penalty = apiConfig.presence_penalty;
        body.top_k = apiConfig.top_k;
      }

      return body;
    };

    const requestWithAttempt = async (attempt: 'full' | 'safe' | 'minimal'): Promise<string> => {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          ...SillyTavern.getRequestHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildAttemptBody(attempt)),
      });

      if (!response.ok) {
        const errTxt = await response.text();
        const err = new Error(`API请求失败: ${response.status} ${errTxt || response.statusText}`);
        (err as Error & { status?: number }).status = response.status;
        throw err;
      }

      const data = (await response.json()) as any;
      if (data?.choices?.[0]?.message?.content) {
        return String(data.choices[0].message.content).trim();
      }
      if (typeof data?.content === 'string') {
        return data.content.trim();
      }
      if (typeof data?.text === 'string') {
        return data.text.trim();
      }

      const details = typeof data === 'object' ? JSON.stringify(data) : String(data);
      throw new Error(`API调用返回无效响应: ${details}`);
    };

    const attempts: Array<'full' | 'safe' | 'minimal'> = ['full', 'safe', 'minimal'];
    let lastError: unknown = null;

    for (let i = 0; i < attempts.length; i++) {
      const attempt = attempts[i];
      try {
        if (i > 0) {
          warn(`自定义 API 参数回退重试：${attempt}`);
        }
        return await requestWithAttempt(attempt);
      } catch (e) {
        lastError = e;
        const status = (e as { status?: number } | null)?.status;
        const msg = e instanceof Error ? e.message : String(e);
        const is422 = status === 422 || /\b422\b/.test(msg);
        const canRetry = is422 && i < attempts.length - 1;
        if (!canRetry) throw e;
        warn(`自定义 API 返回 422，准备继续回退参数：${attempt} -> ${attempts[i + 1]}`);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  },

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

  _cleanupStreamListener(): void {
    if (this._streamStop) {
      this._streamStop.stop();
      this._streamStop = null;
    }
  },

  _getChatContext(maxCount: number): Array<{ role: string; name: string; message: string }> {
    try {
      const messages = getChatMessages(`0-{{lastMessageId}}`, {
        role: 'all',
        hide_state: 'unhidden',
      });

      const list = Array.isArray(messages) ? messages : [];
      const safeMaxCount = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : 20;
      const recent = list.slice(-safeMaxCount);

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

  destroy(): void {
    this._cleanupStreamListener();
    this._onComment = null;
    this._latestStreamText = '';
    this.isGenerating = false;
  },
};
