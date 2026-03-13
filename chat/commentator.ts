import { useSettingsStore } from '../core/settings';
import { error, log, warn } from '../utils/dom';
import { ChatMonitor } from './monitor';
import {
  buildChatPrompt,
  buildPrompt,
  type DiceReferencePromptOptions,
  type RoleplayPromptOptions,
} from './prompt-templates';

type CommentCallback = (text: string, isDone: boolean) => void;
type OrderedPrompt =
  | 'world_info_before'
  | 'world_info_after'
  | { role: 'system' | 'assistant' | 'user'; content: string };
const CONNECTION_PROFILE_NONE = '<None>';

type ApiConnectionProfile = {
  name: string;
  id?: string;
  api?: string;
  model?: string;
  source?: string;
  apiUrl?: string;
  proxyPresetName?: string;
};

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

      let chatMessages = this._getChatContext(s.maxChatContext);
      if (s.useTamakoTodaySpecial) {
        const todaySpecial = this._getTamakoTodaySpecialContent();
        if (todaySpecial) {
          chatMessages = [
            ...chatMessages,
            {
              role: 'system',
              name: '玉子市场今日特选',
              message: todaySpecial,
            },
          ];
          log(`已注入玉子市场“今日特选”上下文（${todaySpecial.length} 字）`);
        } else {
          log('已启用玉子市场兼容，但未读取到“今日特选”，回退到聊天记录');
        }
      }

      if (chatMessages.length === 0) {
        log('没有可用的聊天记录，跳过吐槽');
        return;
      }

      const roleplayOptions = this._resolveRoleplayOptions({
        roleName: s.roleplayName,
        ignoreCommentStyle: !!s.roleplayIgnoreCommentStyle,
        sendCharacterCardContent: !!s.sendCharacterCardContent,
      });
      const diceReferenceOptions = this._resolveDiceReferenceOptions(
        !!s.useDiceDatabaseReference,
        (s as any).diceReferenceVisibleSheets,
      );
      const { system, user } = buildPrompt(
        s.commentStyle,
        s.customPrompt,
        chatMessages,
        !!s.emotionCotEnabled,
        roleplayOptions,
        diceReferenceOptions,
        !!s.ttsBilingualZhJaEnabled,
      );

      this._latestStreamText = '';
      let result: string;

      if (s.apiMode === 'custom' && s.apiConfig.url) {
        result = await this._generateCustom(system, user, s.apiConfig);
      } else if (s.apiMode === 'preset') {
        ChatMonitor.markSelfGeneration();
        result = await this._generatePreset(system, user, s.apiConfig);
      } else {
        ChatMonitor.markSelfGeneration();
        result = await this._generateTavern(system, user, !!s.apiConfig.sendWorldInfo);
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
      const roleplayOptions = this._resolveRoleplayOptions({
        roleName: s.roleplayName,
        ignoreCommentStyle: !!s.roleplayIgnoreCommentStyle,
        sendCharacterCardContent: !!s.sendCharacterCardContent,
      });
      const diceReferenceOptions = this._resolveDiceReferenceOptions(
        !!s.useDiceDatabaseReference,
        (s as any).diceReferenceVisibleSheets,
      );
      const { system, user } = buildChatPrompt(
        s.commentStyle,
        s.customPrompt,
        chatMessages,
        input,
        !!s.emotionCotEnabled,
        roleplayOptions,
        diceReferenceOptions,
        !!s.ttsBilingualZhJaEnabled,
      );

      this._latestStreamText = '';
      let result: string;

      if (s.apiMode === 'custom' && s.apiConfig.url) {
        result = await this._generateCustom(system, user, s.apiConfig);
      } else if (s.apiMode === 'preset') {
        ChatMonitor.markSelfGeneration();
        result = await this._generatePreset(system, user, s.apiConfig);
      } else {
        ChatMonitor.markSelfGeneration();
        result = await this._generateTavern(system, user, !!s.apiConfig.sendWorldInfo);
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

  _buildOrderedPrompts(system: string, user: string, sendWorldInfo: boolean): OrderedPrompt[] {
    return sendWorldInfo
      ? ['world_info_before', { role: 'system', content: system }, 'world_info_after', { role: 'user', content: user }]
      : [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ];
  },

  _normalizeProxyPresetName(value: unknown): string {
    return String(value ?? '').trim();
  },

  _normalizeConnectionProfileSelectionName(value: unknown): string {
    const normalized = this._normalizeProxyPresetName(value);
    if (!normalized || normalized === CONNECTION_PROFILE_NONE) {
      return '';
    }
    return normalized;
  },

  _getConnectionProfileApiMap(apiValue: unknown): Record<string, unknown> | null {
    const apiName = this._normalizeProxyPresetName(apiValue);
    if (!apiName) return null;

    try {
      const context = SillyTavern.getContext?.();
      const apiMap = context?.CONNECT_API_MAP?.[apiName];
      if (!apiMap || typeof apiMap !== 'object' || Array.isArray(apiMap)) {
        return null;
      }
      return apiMap as Record<string, unknown>;
    } catch {
      return null;
    }
  },

  _resolveConnectionProfileSource(apiValue: unknown): string {
    const apiMap = this._getConnectionProfileApiMap(apiValue);
    if (!apiMap || this._normalizeProxyPresetName(apiMap.selected) !== 'openai') {
      return '';
    }
    return this._normalizeProxyPresetName(apiMap.source);
  },

  _isSupportedConnectionProfile(profile: Record<string, unknown>): boolean {
    const apiName = this._normalizeProxyPresetName(profile.api);
    if (!apiName) {
      return false;
    }

    try {
      const context = SillyTavern.getContext?.();
      const requestService = context?.ConnectionManagerRequestService;
      if (requestService && typeof requestService.isProfileSupported === 'function') {
        return !!requestService.isProfileSupported(profile);
      }
    } catch {
      // ignore
    }

    const apiMap = this._getConnectionProfileApiMap(apiName);
    if (!apiMap) {
      return false;
    }

    switch (this._normalizeProxyPresetName(apiMap.selected)) {
      case 'openai':
        return !!this._normalizeProxyPresetName(apiMap.source);
      case 'textgenerationwebui':
        return !!this._normalizeProxyPresetName(apiMap.type);
      default:
        return false;
    }
  },

  _normalizeApiConnectionProfiles(value: unknown): ApiConnectionProfile[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    const profiles: ApiConnectionProfile[] = [];

    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const record = item as Record<string, unknown>;
      const name = this._normalizeProxyPresetName(record.name);
      if (!name || seen.has(name)) continue;

      if (!this._isSupportedConnectionProfile(record)) continue;

      const api = this._normalizeProxyPresetName(record.api);
      const source = this._resolveConnectionProfileSource(api);
      seen.add(name);
      profiles.push({
        name,
        id: this._normalizeProxyPresetName(record.id) || undefined,
        api: api || undefined,
        model: this._normalizeProxyPresetName(record.model) || undefined,
        source: source || undefined,
        apiUrl: this._normalizeProxyPresetName(record['api-url']) || undefined,
        proxyPresetName: this._normalizeProxyPresetName(record.proxy) || undefined,
      });
    }

    return profiles.sort((lhs, rhs) => lhs.name.localeCompare(rhs.name));
  },

  _readApiConnectionManagerSettings(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const root = value as Record<string, unknown>;
    const extensionSettings = root.extensionSettings;
    if (
      extensionSettings &&
      typeof extensionSettings === 'object' &&
      !Array.isArray(extensionSettings) &&
      (extensionSettings as Record<string, unknown>).connectionManager &&
      typeof (extensionSettings as Record<string, unknown>).connectionManager === 'object' &&
      !Array.isArray((extensionSettings as Record<string, unknown>).connectionManager)
    ) {
      return (extensionSettings as Record<string, unknown>).connectionManager as Record<string, unknown>;
    }

    const extension_settings = root.extension_settings;
    if (
      extension_settings &&
      typeof extension_settings === 'object' &&
      !Array.isArray(extension_settings) &&
      (extension_settings as Record<string, unknown>).connectionManager &&
      typeof (extension_settings as Record<string, unknown>).connectionManager === 'object' &&
      !Array.isArray((extension_settings as Record<string, unknown>).connectionManager)
    ) {
      return (extension_settings as Record<string, unknown>).connectionManager as Record<string, unknown>;
    }

    const connectionManager = root.connectionManager;
    if (connectionManager && typeof connectionManager === 'object' && !Array.isArray(connectionManager)) {
      return connectionManager as Record<string, unknown>;
    }

    return null;
  },

  _readApiConnectionProfilesFromContext(): ApiConnectionProfile[] {
    try {
      const context = SillyTavern.getContext?.();
      return this._normalizeApiConnectionProfiles(context?.extensionSettings?.connectionManager?.profiles);
    } catch {
      return [];
    }
  },

  _readApiConnectionProfilesFromDom(): ApiConnectionProfile[] {
    try {
      const topWindow = window.parent ?? window;
      const select = topWindow.document.querySelector('#connection_profiles') as HTMLSelectElement | null;
      if (!select) return [];

      const seen = new Set<string>();
      const profiles: ApiConnectionProfile[] = [];
      for (const option of Array.from(select.options)) {
        const name = this._normalizeProxyPresetName(option.textContent);
        const id = this._normalizeProxyPresetName(option.value);
        if (!name || !id || seen.has(name)) continue;
        seen.add(name);
        profiles.push({ name, id });
      }

      return profiles;
    } catch {
      return [];
    }
  },

  async _loadApiConnectionProfileByName(name: string): Promise<ApiConnectionProfile | null> {
    const profileName = this._normalizeProxyPresetName(name);
    if (!profileName) return null;

    const profiles = this._readApiConnectionProfilesFromContext();
    const matched = profiles.find(profile => profile.name === profileName);
    if (matched) {
      return matched;
    }

    if (typeof triggerSlash !== 'function') {
      return null;
    }

    const escapedName = profileName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const raw = await triggerSlash(`/profile-get "${escapedName}"`);
    const text = String(raw || '').trim();
    if (!text) {
      return null;
    }

    try {
      const parsed = JSON.parse(text);
      const normalized = this._normalizeApiConnectionProfiles([parsed]);
      return normalized[0] ?? null;
    } catch {
      return null;
    }
  },

  async _loadApiConnectionProfiles(): Promise<ApiConnectionProfile[]> {
    const contextProfiles = this._readApiConnectionProfilesFromContext();
    if (contextProfiles.length > 0) {
      return contextProfiles;
    }

    const domProfiles = this._readApiConnectionProfilesFromDom();
    if (domProfiles.length > 0) {
      return domProfiles;
    }

    const response = await fetch('/api/settings/get', {
      method: 'POST',
      headers: {
        ...SillyTavern.getRequestHeaders(),
        'Content-Type': 'application/json',
      },
      body: '{}',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { settings?: unknown };
    const rawSettings = payload?.settings;
    let parsedSettings: unknown = rawSettings;

    if (typeof rawSettings === 'string') {
      parsedSettings = JSON.parse(rawSettings);
    }

    const manager = this._readApiConnectionManagerSettings(parsedSettings);
    if (!manager) {
      return [];
    }

    return this._normalizeApiConnectionProfiles(manager.profiles);
  },

  _escapeSlashArgument(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  },

  async _getCurrentConnectionProfileName(): Promise<string> {
    try {
      const context = SillyTavern.getContext?.();
      const selectedId = this._normalizeProxyPresetName(context?.extensionSettings?.connectionManager?.selectedProfile);
      const profiles = this._normalizeApiConnectionProfiles(context?.extensionSettings?.connectionManager?.profiles);
      if (selectedId) {
        const matched = profiles.find(profile => profile.id === selectedId);
        if (matched) {
          return matched.name;
        }
      }
    } catch {
      // ignore
    }

    if (typeof triggerSlash !== 'function') {
      return '';
    }

    const current = await triggerSlash('/profile');
    return this._normalizeConnectionProfileSelectionName(current);
  },

  async _switchConnectionProfileByName(name: string): Promise<void> {
    if (typeof triggerSlash !== 'function') {
      throw new Error('当前环境不支持切换 API 连接配置');
    }

    const normalizedName = this._normalizeConnectionProfileSelectionName(name);
    const targetName = normalizedName || CONNECTION_PROFILE_NONE;
    const escapedName = this._escapeSlashArgument(targetName);
    await triggerSlash(`/profile await=true timeout=5000 "${escapedName}"`);
  },

  async _withTemporaryConnectionProfile<T>(name: string, task: () => Promise<T>): Promise<T> {
    const targetName = this._normalizeConnectionProfileSelectionName(name);
    const currentName = await this._getCurrentConnectionProfileName();
    if (currentName === targetName) {
      return await task();
    }

    await this._switchConnectionProfileByName(targetName);

    try {
      return await task();
    } finally {
      try {
        await this._switchConnectionProfileByName(currentName);
      } catch (restoreError) {
        error('恢复 API 连接配置失败:', restoreError);
      }
    }
  },

  async _generateTavern(system: string, user: string, sendWorldInfo: boolean): Promise<string> {
    this._setupStreamListener();
    const orderedPrompts = this._buildOrderedPrompts(system, user, sendWorldInfo);

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

  async _generatePreset(
    system: string,
    user: string,
    apiConfig: {
      proxyPreset?: string;
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
    const proxyPreset = this._normalizeProxyPresetName(apiConfig.proxyPreset);
    if (!proxyPreset) {
      throw new Error('请选择 API 连接配置');
    }

    let presetNames: string[];
    let matchedProfile: ApiConnectionProfile | null = null;
    try {
      const profiles = await this._loadApiConnectionProfiles();
      presetNames = profiles.map(profile => profile.name);
      matchedProfile = profiles.find(profile => profile.name === proxyPreset) ?? null;
    } catch {
      throw new Error('API 连接配置列表加载失败，请重试');
    }

    if (!presetNames.includes(proxyPreset)) {
      throw new Error('当前保存的 API 连接配置不存在，请重新选择');
    }

    const fullProfile =
      matchedProfile && matchedProfile.api ? matchedProfile : await this._loadApiConnectionProfileByName(proxyPreset);
    if (!fullProfile || !fullProfile.api || !this._isSupportedConnectionProfile(fullProfile as Record<string, unknown>)) {
      throw new Error('当前 API 连接配置不支持聊天补全');
    }

    if (!apiConfig.usePresetSampling) {
      warn('酒馆 API 连接配置模式固定跟随所选连接配置的采样参数，已忽略手动采样覆盖');
    }

    return await this._withTemporaryConnectionProfile(proxyPreset, async () => {
      this._setupStreamListener();
      try {
        return await generateRaw({
          should_silence: true,
          should_stream: true,
          ordered_prompts: this._buildOrderedPrompts(system, user, !!apiConfig.sendWorldInfo),
          custom_api: undefined,
        });
      } finally {
        this._cleanupStreamListener();
      }
    });
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
    this._streamStop = eventOn(iframe_events.STREAM_TOKEN_RECEIVED_FULLY, (fullText: string) => {
      this._latestStreamText = String(fullText || '');
      this._onComment?.(fullText, false);
    });
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

      return recent.map(msg => ({
        role: msg.role,
        name: msg.name,
        message: msg.message,
      }));
    } catch (e) {
      warn('获取聊天记录失败:', e);
      return [];
    }
  },

  _resolveRoleplayOptions(config: {
    roleName?: string;
    ignoreCommentStyle?: boolean;
    sendCharacterCardContent?: boolean;
  }): RoleplayPromptOptions | undefined {
    const roleName = String(config.roleName || '').trim();
    if (!roleName) {
      return undefined;
    }

    const roleplay: RoleplayPromptOptions = {
      roleName,
      ignoreCommentStyle: config.ignoreCommentStyle === true,
    };
    if (config.sendCharacterCardContent) {
      const characterCardContent = this._getCurrentCharacterCardContent();
      if (characterCardContent) {
        roleplay.characterCardContent = characterCardContent;
      } else {
        log('角色卡内容开关已开启，但未读取到可用角色卡文本');
      }
    }

    return roleplay;
  },

  _resolveDiceReferenceOptions(enabled: boolean, visibleSheets?: unknown): DiceReferencePromptOptions | undefined {
    if (!enabled) {
      return undefined;
    }

    const visibleSheetNames = this._normalizeDiceVisibleSheetNames(visibleSheets);
    const referenceText = this._getDiceDatabaseReferenceContent(visibleSheetNames);
    if (!referenceText) {
      log('数据库参考已启用，但未读取到可用数据');
      return undefined;
    }

    log(`已注入数据库参考（${referenceText.length} 字）`);
    return { referenceText };
  },

  _getDiceDatabaseReferenceContent(visibleSheetNames: string[]): string {
    const apiData = this._getDiceDatabaseDataFromApi();
    if (apiData) {
      const apiSummary = this._summarizeDiceDatabasePayload(
        apiData,
        'AutoCardUpdaterAPI.exportTableAsJson',
        visibleSheetNames,
      );
      if (apiSummary) {
        return apiSummary;
      }
    }

    const chatData = this._getDiceDatabaseDataFromChatContext();
    if (!chatData) {
      return '';
    }

    return this._summarizeDiceDatabasePayload(chatData, '聊天楼层 TavernDB_ACU_* 字段', visibleSheetNames);
  },

  _getDiceDatabaseDataFromApi(): Record<string, unknown> | null {
    try {
      const topWindow = window.parent ?? window;
      const api = (topWindow as any)?.AutoCardUpdaterAPI;
      if (!api || typeof api.exportTableAsJson !== 'function') {
        return null;
      }

      return this._normalizeDiceDatabasePayload(api.exportTableAsJson());
    } catch (e) {
      warn('读取数据库 API 失败:', e);
      return null;
    }
  },

  _getDiceDatabaseDataFromChatContext(): Record<string, unknown> | null {
    try {
      const messages = getChatMessages(`0-{{lastMessageId}}`, {
        role: 'all',
        hide_state: 'all',
      });
      const list = Array.isArray(messages) ? messages : [];

      for (let i = list.length - 1; i >= 0; i--) {
        const payload = this._pickDiceDatabasePayloadFromMessage(list[i] as any);
        if (payload) {
          return payload;
        }
      }
    } catch (e) {
      warn('从聊天记录回退读取数据库失败:', e);
    }

    return null;
  },

  _pickDiceDatabasePayloadFromMessage(message: any): Record<string, unknown> | null {
    if (!message || typeof message !== 'object') {
      return null;
    }

    const directCandidates: unknown[] = [
      message.TavernDB_ACU_IndependentData,
      message.TavernDB_ACU_Data,
      message.TavernDB_ACU_SummaryData,
      message.data?.TavernDB_ACU_IndependentData,
      message.data?.TavernDB_ACU_Data,
      message.data?.TavernDB_ACU_SummaryData,
    ];
    for (const candidate of directCandidates) {
      const payload = this._normalizeDiceDatabasePayload(candidate);
      if (payload) {
        return payload;
      }
    }

    const isolatedCandidates: unknown[] = [message.TavernDB_ACU_IsolatedData, message.data?.TavernDB_ACU_IsolatedData];
    for (const candidate of isolatedCandidates) {
      const payload = this._pickDiceDatabasePayloadFromIsolatedData(candidate);
      if (payload) {
        return payload;
      }
    }

    return null;
  },

  _pickDiceDatabasePayloadFromIsolatedData(value: unknown): Record<string, unknown> | null {
    const isolated = this._parseMaybeJsonRecord(value);
    if (!isolated) {
      return null;
    }

    const keys = Object.keys(isolated);
    for (let i = keys.length - 1; i >= 0; i--) {
      const slot = this._parseMaybeJsonRecord(isolated[keys[i]]);
      if (!slot) {
        continue;
      }
      const payload = this._normalizeDiceDatabasePayload(slot.independentData);
      if (payload) {
        return payload;
      }
    }

    return null;
  },

  _normalizeDiceDatabasePayload(value: unknown): Record<string, unknown> | null {
    const record = this._parseMaybeJsonRecord(value);
    if (!record) {
      return null;
    }
    if (this._isDiceDatabasePayload(record)) {
      return record;
    }

    const independentData = this._parseMaybeJsonRecord(record.independentData);
    if (independentData && this._isDiceDatabasePayload(independentData)) {
      return independentData;
    }

    return null;
  },

  _parseMaybeJsonRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) {
        return null;
      }
      try {
        return this._parseMaybeJsonRecord(JSON.parse(text));
      } catch {
        return null;
      }
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  },

  _isDiceDatabasePayload(value: Record<string, unknown>): boolean {
    return Object.keys(value).some(key => key.startsWith('sheet_'));
  },

  _summarizeDiceDatabasePayload(
    data: Record<string, unknown>,
    sourceLabel: string,
    visibleSheetNames: string[],
  ): string {
    const visibleNameSet = new Set(
      visibleSheetNames.map(name => this._normalizeReferenceText(name)).filter(name => !!name),
    );
    const sheets = Object.keys(data)
      .filter(key => key.startsWith('sheet_'))
      .map(key => this._parseMaybeJsonRecord(data[key]))
      .filter((sheet): sheet is Record<string, unknown> => !!sheet)
      .map(sheet => {
        const name = this._normalizeReferenceText(sheet.name || '');
        return {
          name,
          priority: this._getDiceSheetPriority(name),
          text: this._buildDiceSheetSummary(sheet),
        };
      })
      .filter(item => !!item.text)
      .filter(item => visibleNameSet.size === 0 || visibleNameSet.has(item.name))
      .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 8);

    if (sheets.length === 0) {
      return '';
    }

    const maxLength = 1800;
    const lines = [`来源：${sourceLabel}`, '以下为数据库摘要（仅供参考）：'];

    for (const item of sheets) {
      const nextLine = `- ${item.text}`;
      const nextText = `${lines.join('\n')}\n${nextLine}`;
      if (nextText.length > maxLength) {
        break;
      }
      lines.push(nextLine);
    }

    return lines.join('\n');
  },

  _normalizeDiceVisibleSheetNames(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    const list: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
      const name = this._normalizeReferenceText(item);
      if (!name) {
        continue;
      }
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      list.push(name);
    }
    return list;
  },

  _getDiceSheetPriority(sheetName: string): number {
    const map: Record<string, number> = {
      总结表: 0,
      总体大纲: 1,
      任务与事件表: 2,
      重要人物表: 3,
      全局数据表: 4,
      选项表: 5,
    };
    return map[sheetName] ?? 99;
  },

  _buildDiceSheetSummary(sheet: Record<string, unknown>): string {
    const sheetName = this._normalizeReferenceText(sheet.name || '') || '未命名表';
    const content = Array.isArray(sheet.content) ? (sheet.content as unknown[]) : [];
    const rows = content.filter((row): row is unknown[] => Array.isArray(row));

    if (rows.length === 0) {
      return '';
    }

    const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
    const headers = headerRow.map((cell, index) => this._normalizeReferenceText(cell) || `字段${index}`);
    const dataRows = rows
      .slice(1)
      .filter(row => row.some((cell, index) => index > 0 && !!this._normalizeReferenceText(cell)));

    if (dataRows.length === 0) {
      return `${sheetName}: 暂无有效记录`;
    }

    const rowText = dataRows
      .slice(-2)
      .map(row => this._formatDiceSheetRow(headers, row))
      .filter(text => !!text);
    if (rowText.length === 0) {
      return `${sheetName}: 有记录`;
    }

    return `${sheetName}: ${rowText.join(' | ')}`;
  },

  _formatDiceSheetRow(headers: string[], row: unknown[]): string {
    const pairs: string[] = [];
    for (let index = 1; index < row.length; index++) {
      const value = this._normalizeReferenceText(row[index]);
      if (!value) {
        continue;
      }
      const label = headers[index] || `字段${index}`;
      pairs.push(`${label}: ${this._truncateReferenceText(value, 56)}`);
      if (pairs.length >= 3) {
        break;
      }
    }

    if (pairs.length > 0) {
      return pairs.join('；');
    }

    const fallback = row.map(cell => this._normalizeReferenceText(cell)).find(text => !!text) || '';
    return this._truncateReferenceText(fallback, 90);
  },

  _normalizeReferenceText(value: unknown): string {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  },

  _truncateReferenceText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  },

  _getCurrentCharacterCardContent(): string {
    try {
      const context = SillyTavern?.getContext?.() as any;
      if (!context) {
        return '';
      }

      const characters = Array.isArray(context.characters) ? context.characters : [];
      if (characters.length === 0) {
        return '';
      }

      const charIdRaw = context.characterId;
      let current: any = null;

      if (charIdRaw !== undefined && charIdRaw !== null) {
        const idText = String(charIdRaw).trim();
        const idNum = Number(idText);
        if (Number.isFinite(idNum) && idNum >= 0 && idNum < characters.length) {
          current = characters[idNum];
        }
      }

      if (!current) {
        const currentName = String(context.name2 || '').trim();
        if (currentName) {
          current = characters.find((item: any) => String(item?.name || '').trim() === currentName) || null;
        }
      }

      if (!current && characters.length === 1) {
        current = characters[0];
      }

      if (!current) {
        return '';
      }

      const fields: Array<[string, unknown]> = [
        ['角色名', current.name],
        ['角色描述', current.description ?? current.data?.description],
        ['角色性格', current.personality ?? current.data?.personality],
        ['场景设定', current.scenario ?? current.data?.scenario],
        ['开场白', current.first_mes ?? current.data?.first_mes],
        ['示例对话', current.mes_example ?? current.data?.mes_example],
        ['系统提示', current.data?.system_prompt],
        ['历史后提示', current.data?.post_history_instructions],
      ];

      const lines = fields
        .map(([label, value]) => {
          const text = this._normalizeCharacterCardField(value);
          return text ? `${label}: ${text}` : '';
        })
        .filter(line => !!line);

      return lines.join('\n');
    } catch (e) {
      warn('读取角色卡内容失败:', e);
      return '';
    }
  },

  _normalizeCharacterCardField(value: unknown): string {
    return String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  },

  _getTamakoTodaySpecialContent(): string {
    try {
      const topWindow = window.parent ?? window;
      const topDocument = topWindow.document ?? document;
      const currentSelector = '#tamako-market-window .tamako-content[data-content="current"]';

      const emptyMessage = topDocument.querySelector(`${currentSelector} .tamako-empty .message`);
      if (emptyMessage) {
        return '';
      }

      const plotContent = topDocument.querySelector(`${currentSelector} .tamako-plot-content`) as HTMLElement | null;
      const directText = this._sanitizeTamakoText(plotContent?.innerText || plotContent?.textContent || '');
      if (directText) {
        return directText;
      }

      const beautifierFrame = topDocument.querySelector(
        `${currentSelector} iframe.tamako-beautifier-frame`,
      ) as HTMLIFrameElement | null;
      const payload = this._readTamakoPayloadFromIframe(beautifierFrame);
      const payloadText = this._extractTamakoTextFromPayload(payload);
      if (payloadText) {
        return payloadText;
      }

      const currentContent = topDocument.querySelector(currentSelector) as HTMLElement | null;
      return this._sanitizeTamakoText(currentContent?.innerText || currentContent?.textContent || '');
    } catch (e) {
      warn('读取玉子市场“今日特选”失败:', e);
      return '';
    }
  },

  _readTamakoPayloadFromIframe(iframe: HTMLIFrameElement | null): any | null {
    if (!iframe) {
      return null;
    }
    const name = String(iframe.name || '').trim();
    if (!name.startsWith('TAMAKO_DATA:')) {
      return null;
    }
    try {
      return JSON.parse(name.slice('TAMAKO_DATA:'.length));
    } catch (e) {
      warn('解析玉子市场美化器 payload 失败:', e);
      return null;
    }
  },

  _extractTamakoTextFromPayload(payload: any): string {
    if (!payload || typeof payload !== 'object') {
      return '';
    }

    const captureTags = this._getTamakoCaptureTags();
    const tags = payload.tags && typeof payload.tags === 'object' ? payload.tags : {};
    const valuesFromTags: string[] = [];
    for (const tag of captureTags) {
      const value = this._sanitizeTamakoText(tags[tag]);
      if (value) {
        valuesFromTags.push(value);
      }
    }
    if (valuesFromTags.length > 0) {
      return valuesFromTags.join('\n\n');
    }

    const raw = String(payload.raw || '');
    if (!raw) {
      return '';
    }
    return this._extractTamakoTagText(raw, captureTags);
  },

  _getTamakoCaptureTags(): string[] {
    try {
      const context = SillyTavern?.getContext?.() as any;
      const tags = context?.extensionSettings?.TamakoMarket?.captureTags;
      if (Array.isArray(tags)) {
        const normalized = tags.map(tag => String(tag || '').trim()).filter(tag => !!tag);
        if (normalized.length > 0) {
          return normalized;
        }
      }
    } catch {
      // ignore
    }
    return ['recall', 'scene_direction'];
  },

  _extractTamakoTagText(raw: string, tags: string[]): string {
    const values: string[] = [];
    for (const tag of tags) {
      const safeTag = String(tag || '').trim();
      if (!safeTag) {
        continue;
      }
      const escapedTag = safeTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`<${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedTag}>`, 'gi');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(raw)) !== null) {
        const value = this._sanitizeTamakoText(match[1] || '');
        if (value) {
          values.push(value);
        }
      }
    }
    return values.join('\n\n');
  },

  _sanitizeTamakoText(value: unknown): string {
    const text = String(value ?? '')
      .replace(/\u00a0/g, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!text) {
      return '';
    }
    if (/^(空空如也~|等待中\.\.\.|暂无内容|正在搜寻\.\.\.|扫描中\.\.\.|请稍等\.\.\.)$/.test(text)) {
      return '';
    }
    return text;
  },

  destroy(): void {
    this._cleanupStreamListener();
    this._onComment = null;
    this._latestStreamText = '';
    this.isGenerating = false;
  },
};
