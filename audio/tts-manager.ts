import { SCRIPT_NAME } from '../core/constants';
import { useSettingsStore } from '../core/settings';
import { Live2DManager } from '../live2d/manager';
import { LipSyncManager } from '../live2d/lip-sync';
import {
  TTS_PROVIDER,
  getTTSProvider,
  getGptSoVitsConfig,
  getCharacterTTSVoice,
  resolveVoiceByName,
  inferResourceId,
  normalizeGptSoVitsSwitchMode,
  type TTSSpeakerVoice,
} from './tts-config';
import { synthesizeToBlob } from './edge-tts-direct';

// ============================================
// TTS 管理器 (LittleWhiteBox / GPT-SoVITS / EdgeTTS Direct)
// 参考: galgame通用生成器 src/audio/tts-manager.js
// ============================================

export type TTSSegment = {
  type: 'dialogue' | 'narration';
  speaker: string;
  text: string;
  tts?: {
    speaker?: string;
    context?: string;
  };
};

type ToastFn = (msg: string) => void;

function getTopWindow(): Window {
  try {
    return window.parent ?? window;
  } catch {
    return window;
  }
}

function getSettingsSnapshot(): any {
  try {
    const store = useSettingsStore();
    return store.settings;
  } catch {
    return {};
  }
}

// 延迟引用: showToast (来自 UI 层)
let _showToastRef: ToastFn | null = null;
export function setTTSManagerRefs({ showToast }: { showToast?: ToastFn }): void {
  if (showToast) _showToastRef = showToast;
}

function showToast(msg: string): void {
  if (_showToastRef) {
    _showToastRef(msg);
    return;
  }

  try {
    const topAny: any = getTopWindow() as any;
    const t = topAny?.toastr || (window as any)?.toastr;
    if (t?.info) {
      t.info(msg);
      return;
    }
  } catch {
    // ignore
  }

  console.log(`[${SCRIPT_NAME}]`, msg);
}

function clipText(text: unknown, max = 160): string {
  const value = String(text || '');
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function isProxyNotFound(status: number, bodyText = ''): boolean {
  if (status !== 404) return false;
  const body = String(bodyText || '').toLowerCase();
  return body.includes('not found') || body.includes('/proxy') || body.includes('cannot get');
}

function safeUrl(input: unknown): URL | null {
  try {
    return new URL(String(input || ''));
  } catch {
    return null;
  }
}

function hasLive2D(): boolean {
  return !!Live2DManager.model;
}

export const TTSManager = {
  enabled: true,
  provider: TTS_PROVIDER.LITTLEWHITEBOX,
  autoPlay: true,
  isPlaying: false,
  isLoading: false,
  currentAudio: null as HTMLAudioElement | null,
  currentSegmentId: null as string | null,
  littleWhiteBox: null as any,
  xiaobaixTts: null as any,

  _gptSoVitsResolvedProxyRoute: '',
  _gptSoVitsActiveWeights: { gpt: '', sovits: '' },
  _gptSoVitsWeightSwitchUnavailable: false,
  _gptSoVitsWeightSwitchWarned: false,
  _gptSoVitsProxyWarned: false,
  _gptSoVitsFetchController: null as AbortController | null,
  _edgeDirectFetchController: null as AbortController | null,
  _edgeDirectSocket: null as WebSocket | null,
  _edgeDirectObjectUrl: '' as string,

  _refreshProviderState(): boolean {
    const provider = getTTSProvider();
    this.provider = provider;
    this.autoPlay = getSettingsSnapshot()?.ttsAutoPlay !== false;

    const topAny: any = getTopWindow() as any;

    if (provider === TTS_PROVIDER.LITTLEWHITEBOX) {
      this.xiaobaixTts = null;
      this.littleWhiteBox = null;

      if (topAny?.xiaobaixTts) {
        this.xiaobaixTts = topAny.xiaobaixTts;
        console.log(`[${SCRIPT_NAME}] TTSManager: 已连接到 xiaobaixTts`);
      } else if (topAny?.LittleWhiteBox) {
        this.littleWhiteBox = topAny.LittleWhiteBox;
        console.log(`[${SCRIPT_NAME}] TTSManager: 已连接到 LittleWhiteBox`);
      }

      if (!this.xiaobaixTts && !this.littleWhiteBox) {
        console.warn(`[${SCRIPT_NAME}] TTSManager: 未找到 xiaobaixTts/LittleWhiteBox，将禁用TTS`);
        this.enabled = false;
        return false;
      }

      this.enabled = true;
      return true;
    }

    if (provider === TTS_PROVIDER.GPT_SOVITS_V2) {
      this.enabled = true;
      return true;
    }

    if (provider === TTS_PROVIDER.EDGE_TTS_DIRECT) {
      this.enabled = true;
      return true;
    }

    this.enabled = true;
    return true;
  },

  _onPlaybackEnded(reason = 'unknown'): void {
    this._cleanupEdgeDirectResources();
    console.log(`[${SCRIPT_NAME}] TTS: 播放结束 - reason=${reason}`);
    this.isPlaying = false;
    this.isLoading = false;
    this.currentAudio = null;
    this.currentSegmentId = null;
    this.hideLoadingIndicator();
    LipSyncManager.stopSync();
  },

  init(): void {
    this._refreshProviderState();

    try {
      const topAny: any = getTopWindow() as any;
      const jq = topAny?.jQuery || topAny?.$;
      if (jq) {
        jq(topAny).on('tts_complete tts_end', () => {
          this._onPlaybackEnded('littlewhitebox_event');
        });
      }
    } catch {
      // ignore
    }
  },

  showLoadingIndicator(): void {
    try {
      const top = getTopWindow();
      top.document.getElementById('desktop-pet-stage')?.classList.add('desktop-pet-tts-active');
    } catch {
      // ignore
    }
  },

  hideLoadingIndicator(): void {
    try {
      const top = getTopWindow();
      top.document.getElementById('desktop-pet-stage')?.classList.remove('desktop-pet-tts-active');
    } catch {
      // ignore
    }
  },

  _abortGptSoVitsFetch(reason = 'manual'): void {
    if (this._gptSoVitsFetchController) {
      try {
        this._gptSoVitsFetchController.abort(reason);
      } catch {
        // ignore
      }
      this._gptSoVitsFetchController = null;
    }
  },

  _cleanupEdgeDirectResources(): void {
    if (this._edgeDirectFetchController) {
      try {
        this._edgeDirectFetchController.abort('cleanup');
      } catch {
        // ignore
      }
      this._edgeDirectFetchController = null;
    }

    if (this._edgeDirectSocket) {
      try {
        this._edgeDirectSocket.close(1000, 'cleanup');
      } catch {
        // ignore
      }
      this._edgeDirectSocket = null;
    }

    if (this._edgeDirectObjectUrl) {
      try {
        URL.revokeObjectURL(this._edgeDirectObjectUrl);
      } catch {
        // ignore
      }
      this._edgeDirectObjectUrl = '';
    }
  },

  stop(): void {
    if (
      !this.isPlaying &&
      !this.isLoading &&
      !this._edgeDirectSocket &&
      !this._edgeDirectFetchController &&
      !this._edgeDirectObjectUrl
    ) {
      return;
    }

    this._abortGptSoVitsFetch('stop');
    this._cleanupEdgeDirectResources();
    console.log(`[${SCRIPT_NAME}] TTS: 中止当前播放`);

    try {
      if (this.currentAudio && typeof this.currentAudio.pause === 'function') {
        try {
          this.currentAudio.pause();
        } catch {
          // ignore
        }
        try {
          this.currentAudio.src = '';
          if (typeof this.currentAudio.load === 'function') this.currentAudio.load();
        } catch {
          // ignore
        }
      }

      if (this.xiaobaixTts && this.xiaobaixTts.player) {
        const player = this.xiaobaixTts.player;
        if (typeof player._stopCurrent === 'function') {
          player._stopCurrent();
        }
        if (typeof player.clear === 'function') {
          player.clear();
          console.log(`[${SCRIPT_NAME}] TTS: 已清空播放队列`);
        }
      } else if (this.xiaobaixTts && typeof this.xiaobaixTts.stop === 'function') {
        this.xiaobaixTts.stop();
      } else if (this.littleWhiteBox && typeof this.littleWhiteBox.stop === 'function') {
        this.littleWhiteBox.stop();
      }
    } catch (e) {
      console.warn(`[${SCRIPT_NAME}] TTS: 停止播放失败`, e);
    }

    this.isPlaying = false;
    this.isLoading = false;
    this.currentAudio = null;
    this.currentSegmentId = null;
    this.hideLoadingIndicator();
    LipSyncManager.stopSync();
  },

  _getCurrentAudioElement(): HTMLAudioElement | null {
    if (this.currentAudio) return this.currentAudio;

    if (this.xiaobaixTts?.player?.currentAudio) {
      return this.xiaobaixTts.player.currentAudio;
    }
    if (this.xiaobaixTts?.player?.audio) {
      return this.xiaobaixTts.player.audio;
    }
    if (this.xiaobaixTts?.player?.audioElements?.length > 0) {
      return this.xiaobaixTts.player.audioElements[0];
    }
    if (this.xiaobaixTts?.audio) {
      return this.xiaobaixTts.audio;
    }

    const top = getTopWindow();
    const allAudio = top.document.querySelectorAll('audio');
    for (const audio of allAudio) {
      if ((audio as HTMLAudioElement).src && !(audio as HTMLAudioElement).paused) {
        return audio as HTMLAudioElement;
      }
    }
    const anyAudio = top.document.querySelector('audio[src]') as HTMLAudioElement | null;
    if (anyAudio) return anyAudio;
    return null;
  },

  _getPreferredAudioElement(): HTMLAudioElement | null {
    if (this.currentAudio) return this.currentAudio;
    if (this.xiaobaixTts?.player?.currentAudio) {
      return this.xiaobaixTts.player.currentAudio;
    }
    if (this.xiaobaixTts?.player?.audio) {
      return this.xiaobaixTts.player.audio;
    }
    if (this.xiaobaixTts?.player?.audioElements?.length > 0) {
      return this.xiaobaixTts.player.audioElements[0];
    }
    if (this.xiaobaixTts?.audio) {
      return this.xiaobaixTts.audio;
    }
    return null;
  },

  _isProxyUrl(url: unknown): boolean {
    const parsed = safeUrl(url);
    if (!parsed) return false;
    return /^\/proxy(\/|\?|$)/i.test(parsed.pathname);
  },

  _buildGptSoVitsProxyUrl(route: string, originalUrl: string): string {
    const direct = String(originalUrl || '').trim();
    if (!direct) return '';
    const encoded = encodeURIComponent(direct);
    const origin = window.location?.origin || '';

    switch (route) {
      case 'proxy_path_relative':
        return `/proxy/${encoded}`;
      case 'proxy_path_origin':
        return origin ? `${origin}/proxy/${encoded}` : '';
      case 'proxy_query_relative':
        return `/proxy?url=${encoded}`;
      case 'proxy_query_origin':
        return origin ? `${origin}/proxy?url=${encoded}` : '';
      default:
        return '';
    }
  },

  _rememberProxyRoute(route: string, url: string): void {
    if (!route) return;
    if (this._gptSoVitsResolvedProxyRoute !== route) {
      this._gptSoVitsResolvedProxyRoute = route;
      console.log(`[${SCRIPT_NAME}] GPT-SoVITS 浠ｇ悊璺敱宸查攣瀹? ${route} -> ${clipText(url, 96)}`);
    }
  },

  _getProxiedAudioUrl(originalUrl: string): string {
    const directUrl = String(originalUrl || '').trim();
    if (!directUrl) return directUrl;
    if (this._isProxyUrl(directUrl)) return directUrl;

    const topAny: any = getTopWindow() as any;

    if (typeof topAny.getCorsProxyUrl === 'function') {
      try {
        const proxied = topAny.getCorsProxyUrl(directUrl);
        if (typeof proxied === 'string' && proxied) return proxied;
      } catch {
        // ignore
      }
    }

    if (typeof topAny.enableCorsProxy === 'function') {
      try {
        const proxied = topAny.enableCorsProxy(directUrl);
        if (typeof proxied === 'string' && proxied) return proxied;
      } catch {
        // ignore
      }
    }

    if (topAny.corsProxy?.getProxyUrl) {
      try {
        const proxied = topAny.corsProxy.getProxyUrl(directUrl);
        if (typeof proxied === 'string' && proxied) return proxied;
      } catch {
        // ignore
      }
    }

    const remembered = String(this._gptSoVitsResolvedProxyRoute || '').trim();
    if (remembered) {
      const rememberedUrl = this._buildGptSoVitsProxyUrl(remembered, directUrl);
      if (rememberedUrl) return rememberedUrl;
    }

    return (
      this._buildGptSoVitsProxyUrl('proxy_path_relative', directUrl) ||
      this._buildGptSoVitsProxyUrl('proxy_query_relative', directUrl) ||
      directUrl
    );
  },

  _buildGptSoVitsTtsUrl(text: string, resolvedVoice: TTSSpeakerVoice): string {
    const cfg = getGptSoVitsConfig();
    const base = String(cfg.apiUrl || '').replace(/\/$/, '');
    const endpointRaw = String(cfg.endpoint || '/tts').trim();
    const endpoint = endpointRaw.startsWith('/') ? endpointRaw : `/${endpointRaw}`;
    if (!base) return '';

    try {
      const url = new URL(base + endpoint);
      const vcfg: any = resolvedVoice?.gptSoVits || {};

      const textLang = String(vcfg.textLang || cfg.textLang || 'auto').trim() || 'auto';
      const promptLang = String(vcfg.promptLang || 'zh').trim() || 'zh';
      const refAudioPath = String(vcfg.refAudioPath || '').trim();
      const promptText = String(vcfg.promptText || '').trim();

      url.searchParams.set('text', text);
      url.searchParams.set('text_lang', textLang);
      url.searchParams.set('ref_audio_path', refAudioPath);
      url.searchParams.set('prompt_lang', promptLang);
      url.searchParams.set('prompt_text', promptText);

      if (cfg.textSplitMethod) url.searchParams.set('text_split_method', String(cfg.textSplitMethod));
      if (cfg.mediaType) url.searchParams.set('media_type', String(cfg.mediaType));
      url.searchParams.set('streaming_mode', cfg.streamingMode ? 'true' : 'false');
      if (cfg.speedFactor) url.searchParams.set('speed_factor', String(cfg.speedFactor));

      return url.toString();
    } catch (e) {
      console.warn(`[${SCRIPT_NAME}] GPT-SoVITS: 生成URL失败`, e);
      return '';
    }
  },

  async _requestGptSoVitsApi(
    method: 'GET' | 'POST',
    pathname: string,
    queryParams: Record<string, any> = {},
    jsonBody: any = undefined,
  ): Promise<{ text: string; status: number; url: string; route: string }> {
    const cfg = getGptSoVitsConfig();
    const base = String(cfg.apiUrl || '').replace(/\/$/, '');
    const pathRaw = String(pathname || '').trim() || '/';
    const path = pathRaw.startsWith('/') ? pathRaw : `/${pathRaw}`;
    if (!base) throw new Error('GPT-SoVITS API 地址为空');

    const directUrlObj = new URL(base + path);
    Object.entries(queryParams || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        directUrlObj.searchParams.set(String(key), String(value));
      }
    });
    const directUrl = directUrlObj.toString();

    const attemptTargets: Array<{ route: string; url: string }> = [];
    if (!cfg.useCorsProxy) {
      attemptTargets.push({ route: 'direct', url: directUrl });
    } else {
      const preferred = String(this._gptSoVitsResolvedProxyRoute || '').trim();
      const seen = new Set<string>();
      const addTarget = (route: string, url: string) => {
        if (!url || seen.has(url)) return;
        seen.add(url);
        attemptTargets.push({ route, url });
      };

      if (preferred) addTarget(preferred, this._buildGptSoVitsProxyUrl(preferred, directUrl));
      addTarget('proxy_path_relative', this._buildGptSoVitsProxyUrl('proxy_path_relative', directUrl));
      addTarget('proxy_path_origin', this._buildGptSoVitsProxyUrl('proxy_path_origin', directUrl));
      addTarget('proxy_query_relative', this._buildGptSoVitsProxyUrl('proxy_query_relative', directUrl));
      addTarget('proxy_query_origin', this._buildGptSoVitsProxyUrl('proxy_query_origin', directUrl));
      addTarget('direct', directUrl);
    }

    const errors: string[] = [];
    for (const target of attemptTargets) {
      const controller = new AbortController();
      this._gptSoVitsFetchController = controller;

      try {
        const options: RequestInit & { headers: Record<string, string> } = {
          method,
          mode: 'cors',
          credentials: 'omit',
          signal: controller.signal,
          headers: {},
        };

        if (jsonBody !== undefined) {
          options.headers['Content-Type'] = 'application/json';
          options.body = JSON.stringify(jsonBody);
        }

        const response = await fetch(target.url, options);
        const text = await response.text();

        if (response.ok) {
          if (target.route !== 'direct') {
            this._rememberProxyRoute(target.route, target.url);
          }
          return { text, status: response.status, url: target.url, route: target.route };
        }

        if (target.route !== 'direct' && isProxyNotFound(response.status, text)) {
          errors.push(`${target.route}:HTTP${response.status}(proxy-not-found)`);
          continue;
        }

        errors.push(`${target.route}:HTTP${response.status}:${clipText(text, 120)}`);
      } catch (e: any) {
        const msg = e?.message || String(e);
        errors.push(`${target.route}:${msg}`);
      } finally {
        if (this._gptSoVitsFetchController === controller) {
          this._gptSoVitsFetchController = null;
        }
      }
    }

    throw new Error(`${method} ${path} 失败 -> ${errors.join(' | ')}`);
  },

  async _fetchGptSoVitsApi(pathname: string, queryParams: Record<string, any> = {}): Promise<string> {
    const { text } = await this._requestGptSoVitsApi('GET', pathname, queryParams);
    return text;
  },

  async _postGptSoVitsApi(pathname: string, jsonBody: Record<string, any> = {}): Promise<string> {
    const { text } = await this._requestGptSoVitsApi('POST', pathname, {}, jsonBody);
    return text;
  },

  async _setGptSoVitsWeights(kind: 'gpt' | 'sovits', weightsPath: string): Promise<void> {
    const normalizedKind = kind === 'gpt' ? 'gpt' : 'sovits';
    const path = String(weightsPath || '').trim();
    if (!path) return;
    const endpoint = `/set_${normalizedKind}_weights`;
    await this._fetchGptSoVitsApi(endpoint, { weights_path: path });
  },

  async _setGptSoVitsModelPair(
    gptWeightsPath: string,
    sovitsWeightsPath: string,
    endpointOverride = '',
  ): Promise<void> {
    const cfg = getGptSoVitsConfig();
    const endpoint = String(endpointOverride || cfg.setModelEndpoint || '/set_model').trim() || '/set_model';

    try {
      await this._postGptSoVitsApi(endpoint, {
        gpt_model_path: String(gptWeightsPath || '').trim(),
        sovits_model_path: String(sovitsWeightsPath || '').trim(),
      });
      return;
    } catch {
      await this._fetchGptSoVitsApi(endpoint, {
        gpt_model_path: String(gptWeightsPath || '').trim(),
        sovits_model_path: String(sovitsWeightsPath || '').trim(),
      });
    }
  },

  async _ensureGptSoVitsWeights(resolvedVoice: TTSSpeakerVoice): Promise<boolean> {
    const cfg = getGptSoVitsConfig();
    const vcfg: any = resolvedVoice?.gptSoVits || {};

    const desiredGpt = String(vcfg.gptWeightsPath || '').trim();
    const desiredSovits = String(vcfg.sovitsWeightsPath || '').trim();

    let switchMode = normalizeGptSoVitsSwitchMode(vcfg.modelSwitchMode || cfg.modelSwitchMode);
    const setModelEndpoint = String(vcfg.setModelEndpoint || cfg.setModelEndpoint || '/set_model').trim() || '/set_model';

    if (switchMode === 'none') return true;
    if (!desiredGpt && !desiredSovits) return true;
    if (this._gptSoVitsWeightSwitchUnavailable) return false;

    if (switchMode === 'set_model') {
      if (desiredGpt && desiredSovits) {
        try {
          await this._setGptSoVitsModelPair(desiredGpt, desiredSovits, setModelEndpoint);
          this._gptSoVitsActiveWeights.gpt = desiredGpt;
          this._gptSoVitsActiveWeights.sovits = desiredSovits;
          return true;
        } catch (e) {
          console.warn(`[${SCRIPT_NAME}] GPT-SoVITS: set_model 失败，回退 set_weights`, e);
          switchMode = 'set_weights';
        }
      } else {
        switchMode = 'set_weights';
      }
    }

    if (switchMode === 'set_weights') {
      try {
        if (desiredGpt && desiredGpt !== this._gptSoVitsActiveWeights.gpt) {
          await this._setGptSoVitsWeights('gpt', desiredGpt);
          this._gptSoVitsActiveWeights.gpt = desiredGpt;
        }
        if (desiredSovits && desiredSovits !== this._gptSoVitsActiveWeights.sovits) {
          await this._setGptSoVitsWeights('sovits', desiredSovits);
          this._gptSoVitsActiveWeights.sovits = desiredSovits;
        }
        return true;
      } catch (e) {
        if (!this._gptSoVitsWeightSwitchWarned) {
          this._gptSoVitsWeightSwitchWarned = true;
          showToast('GPT-SoVITS 切换权重失败，请检查 /proxy 下 set_* 接口');
        }
        console.warn(`[${SCRIPT_NAME}] GPT-SoVITS: set_weights 失败`, e);
        return false;
      }
    }

    return true;
  },

  async _speakWithGptSoVits(segment: TTSSegment, segmentId: string, resolvedVoice: TTSSpeakerVoice): Promise<boolean> {
    const cfg = getGptSoVitsConfig();
    const vcfg: any = resolvedVoice?.gptSoVits || {};

    if (!cfg.apiUrl) {
      showToast('GPT-SoVITS: 请先在设置中填写 API 地址');
      return false;
    }
    if (!String(vcfg.refAudioPath || '').trim()) {
      showToast('GPT-SoVITS: 当前音色缺少 refAudioPath');
      return false;
    }

    await this._ensureGptSoVitsWeights(resolvedVoice);

    const directUrl = this._buildGptSoVitsTtsUrl(segment.text, resolvedVoice);
    if (!directUrl) {
      showToast('GPT-SoVITS: 无法生成请求URL');
      return false;
    }

    const audioUrl = cfg.useCorsProxy ? this._getProxiedAudioUrl(directUrl) : directUrl;

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = audioUrl;

    this.currentAudio = audio;
    this.currentSegmentId = segmentId;

    const onEnded = () => {
      if (this.currentAudio === audio) {
        this._onPlaybackEnded('gpt_sovits_audio_ended');
      }
    };
    const onError = (e: any) => {
      console.warn(`[${SCRIPT_NAME}] GPT-SoVITS: audio error`, e);
      if (!this._gptSoVitsProxyWarned && cfg.useCorsProxy) {
        this._gptSoVitsProxyWarned = true;
        showToast('GPT-SoVITS 代理失败，请检查 /proxy 路由和 CORS 设置');
      } else {
        showToast('GPT-SoVITS 播放失败（请检查地址/代理/CORS）');
      }
      onEnded();
    };

    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });

    try {
      await audio.play();
    } catch (e) {
      console.warn(`[${SCRIPT_NAME}] GPT-SoVITS: play() 失败`, e);
      showToast('GPT-SoVITS 播放被浏览器拦截（需要用户交互）');
      onEnded();
      return false;
    }

    this.isPlaying = true;

    if (hasLive2D()) {
      const lipId = segment.speaker || 'pet';
      console.log(`[${SCRIPT_NAME}] TTS: 检查口型同步: hasLive2D=true, speaker=${lipId}`);
      this._startLipSyncOnPlay(lipId);
    } else {
      console.log(`[${SCRIPT_NAME}] TTS: Live2D 未就绪，跳过口型同步`);
    }

    return true;
  },

  async _speakWithEdgeDirect(segment: TTSSegment, segmentId: string, resolvedVoice: TTSSpeakerVoice): Promise<boolean> {
    const voiceName = String(resolvedVoice.value || resolvedVoice.name || '').trim();
    if (!voiceName) {
      showToast('EdgeTTS 直连：无可用音色');
      return false;
    }

    this._cleanupEdgeDirectResources();

    const controller = new AbortController();
    this._edgeDirectFetchController = controller;

    let blob: Blob;
    try {
      blob = await synthesizeToBlob(segment.text, resolvedVoice, {
        signal: controller.signal,
        onSocket: socket => {
          this._edgeDirectSocket = socket;
        },
      });
    } catch (e: any) {
      const isAbort = e?.name === 'AbortError';
      if (!isAbort) {
        const reason = clipText(e?.message || String(e), 180);
        const blockedHint = /likely-cause=ua-not-edg/i.test(reason)
          ? '（当前浏览器不是 Edge，微软接口通常会拒绝握手；请改用 Edge 浏览器重试）'
          : /1006|403|websocket/i.test(reason)
            ? '（可能是浏览器 CSP/网络策略拦截了 wss 连接；也可切换 Edge 浏览器复测）'
            : '';
        console.warn(`[${SCRIPT_NAME}] EdgeTTS 直连合成失败:`, e);
        showToast(`EdgeTTS 直连失败：${reason}${blockedHint}`);
      }
      return false;
    } finally {
      if (this._edgeDirectFetchController === controller) {
        this._edgeDirectFetchController = null;
      }
      this._edgeDirectSocket = null;
    }

    if (!blob || blob.size <= 0) {
      showToast('EdgeTTS 直连未返回音频数据');
      return false;
    }

    const objectUrl = URL.createObjectURL(blob);
    this._edgeDirectObjectUrl = objectUrl;

    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.src = objectUrl;

    this.currentAudio = audio;
    this.currentSegmentId = segmentId;

    const onEnded = () => {
      if (this.currentAudio === audio) {
        this._onPlaybackEnded('edge_direct_audio_ended');
      }
    };
    const onError = (err: any) => {
      console.warn(`[${SCRIPT_NAME}] EdgeTTS 直连播放失败:`, err);
      showToast('EdgeTTS 直连播放失败，可切换 Edge 浏览器复测');
      onEnded();
    };

    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });

    try {
      await audio.play();
    } catch (e) {
      console.warn(`[${SCRIPT_NAME}] EdgeTTS 直连 play() 失败:`, e);
      showToast('EdgeTTS 播放被浏览器拦截，请先进行一次页面交互');
      onEnded();
      return false;
    }

    this.isPlaying = true;

    if (hasLive2D()) {
      const lipId = segment.speaker || 'pet';
      this._startLipSyncOnPlay(lipId);
    }

    return true;
  },

  _startLipSyncWhenModelReady(characterId: string, maxWait = 5000): void {
    const startTime = Date.now();
    const tryWait = () => {
      if (hasLive2D()) {
        this._startLipSyncOnPlay(characterId, maxWait);
        return;
      }
      if (Date.now() - startTime < maxWait) {
        setTimeout(tryWait, 120);
      } else {
        console.warn(`[${SCRIPT_NAME}] LipSync: 模型加载超时，放弃口型同步 - characterId=${characterId}`);
      }
    };
    tryWait();
  },

  async _waitForModelReadyBeforeTTS(_characterId: string, maxWait = 5000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      if (hasLive2D()) return true;
      await new Promise(r => setTimeout(r, 120));
    }
    console.warn(`[${SCRIPT_NAME}] TTS: 等待模型就绪超时，仍继续请求TTS`);
    return false;
  },

  _startLipSyncOnPlay(characterId: string, maxWait = 5000): void {
    console.log(`[${SCRIPT_NAME}] LipSync: _startLipSyncOnPlay 被调用 - characterId=${characterId}`);
    const startTime = Date.now();
    let hasStarted = false;

    const tryBind = () => {
      const preferredAudio = this._getPreferredAudioElement();
      const audioElement = preferredAudio || this._getCurrentAudioElement();
      console.log(
        `[${SCRIPT_NAME}] LipSync: 获取音频元素 -`,
        audioElement
          ? `src=${audioElement.src?.substring(0, 50)}... paused=${audioElement.paused} currentTime=${audioElement.currentTime}`
          : 'null',
      );

      if (!audioElement) {
        if (Date.now() - startTime < maxWait && !hasStarted) {
          setTimeout(tryBind, 100);
        } else if (!hasStarted) {
          console.warn(`[${SCRIPT_NAME}] LipSync: 超时未找到音频元素`);
        }
        return;
      }

      if (!audioElement.paused) {
        console.log(`[${SCRIPT_NAME}] LipSync: 音频已在播放，立即启动口型同步`);
        hasStarted = true;
        this._bindLipSyncToAudio(audioElement, characterId);
        return;
      }

      if (!preferredAudio) {
        if (Date.now() - startTime < maxWait && !hasStarted) {
          setTimeout(tryBind, 100);
        } else if (!hasStarted) {
          console.warn(`[${SCRIPT_NAME}] LipSync: 等待播放超时，尝试强制启动`);
          if (audioElement.src) {
            this._bindLipSyncToAudio(audioElement, characterId);
          }
        }
        return;
      }

      console.log(`[${SCRIPT_NAME}] LipSync: 等待音频播放...`);

      const onPlaying = () => {
        if (hasStarted) return;
        hasStarted = true;
        console.log(`[${SCRIPT_NAME}] LipSync: 音频开始播放，启动口型同步`);
        this._bindLipSyncToAudio(audioElement, characterId);
      };

      audioElement.addEventListener('playing', onPlaying, { once: true });
      audioElement.addEventListener('play', onPlaying, { once: true });

      const onTimeUpdate = () => {
        if (hasStarted) return;
        if (audioElement.currentTime > 0 && !audioElement.paused) {
          console.log(`[${SCRIPT_NAME}] LipSync: timeupdate 触发，启动口型同步`);
          onPlaying();
        }
      };
      audioElement.addEventListener('timeupdate', onTimeUpdate);

      setTimeout(() => {
        audioElement.removeEventListener('playing', onPlaying);
        audioElement.removeEventListener('play', onPlaying);
        audioElement.removeEventListener('timeupdate', onTimeUpdate);
        if (!hasStarted) {
          console.warn(`[${SCRIPT_NAME}] LipSync: 等待播放超时，尝试强制启动`);
          if (audioElement.src) {
            this._bindLipSyncToAudio(audioElement, characterId);
          }
        }
      }, maxWait);
    };

    tryBind();
  },

  _bindLipSyncToAudio(audioElement: HTMLAudioElement, characterId: string): void {
    if (LipSyncManager.connectAudio(audioElement)) {
      void LipSyncManager.startSync(characterId);
    }

    const onEnd = () => {
      console.log(`[${SCRIPT_NAME}] LipSync: 音频结束/暂停，停止口型同步`);
      LipSyncManager.stopSync();
      audioElement.removeEventListener('ended', onEnd);
      audioElement.removeEventListener('pause', onEnd);
    };

    audioElement.addEventListener('ended', onEnd, { once: true });
    audioElement.addEventListener('pause', onEnd, { once: true });
  },

  async speak(segment: TTSSegment, segmentId: string): Promise<void> {
    if (!segment || segment.type !== 'dialogue') {
      if (segment && segment.type === 'narration') {
        console.log(`[${SCRIPT_NAME}] TTS: 跳过旁白 - ${segment.text.substring(0, 30)}...`);
      }
      return;
    }
    if (!segment.text) return;

    const provider = getTTSProvider();
    if (provider !== this.provider || !this.enabled) {
      this._refreshProviderState();
    }
    if (!this.enabled) return;

    const settings = getSettingsSnapshot();
    const ttsConfig = segment.tts || {};
    const boundVoice = getCharacterTTSVoice(segment.speaker);
    let voiceName = ttsConfig.speaker || boundVoice || settings.ttsDefaultSpeaker;
    if (!voiceName) {
      voiceName = provider === TTS_PROVIDER.GPT_SOVITS_V2 ? segment.speaker || '' : '桃夭';
    }
    if (!voiceName) voiceName = '桃夭';
    const context = ttsConfig.context || '';

    const resolvedVoice = await resolveVoiceByName(String(voiceName || ''));
    if (!resolvedVoice) {
      console.error(`[${SCRIPT_NAME}] TTS播放失败: 无法解析音色 "${voiceName}" (provider=${provider})`);
      if (provider === TTS_PROVIDER.GPT_SOVITS_V2) {
        showToast('GPT-SoVITS: 请先在设置中配置音色列表');
      }
      return;
    }

    console.log(
      `[${SCRIPT_NAME}] TTS播放: provider=${provider}, voiceName=${voiceName}, context=${context || '无'}, text=${segment.text.substring(0, 30)}...`,
    );
    if (hasLive2D()) {
      try {
        const info = Live2DManager.getLipSyncDebugInfo();
        console.log(
          `[${SCRIPT_NAME}] TTS口型策略: lipSyncOverride=active, mouthParamsSource=${info.mouthParamsSource}, count=${info.mouthParamsCount}`,
        );
      } catch {
        // ignore
      }
    }

    this.isLoading = true;
    this.showLoadingIndicator();

    try {
      await this._waitForModelReadyBeforeTTS(segment.speaker);

      if (provider === TTS_PROVIDER.GPT_SOVITS_V2) {
        await this._speakWithGptSoVits(segment, segmentId, resolvedVoice);
        return;
      }

      if (provider === TTS_PROVIDER.EDGE_TTS_DIRECT) {
        await this._speakWithEdgeDirect(segment, segmentId, resolvedVoice);
        return;
      }

      const speakerValue = resolvedVoice.value;
      const resourceId = inferResourceId(speakerValue);

      if (this.xiaobaixTts && typeof this.xiaobaixTts.speak === 'function') {
        await this.xiaobaixTts.speak(segment.text, {
          speaker: speakerValue,
          resourceId,
          contextTexts: context ? [context] : [],
        });
        this.isPlaying = true;
        this.currentSegmentId = segmentId;
        if (hasLive2D()) {
          this._startLipSyncOnPlay(segment.speaker || 'pet');
        }
        return;
      }

      if (this.littleWhiteBox && typeof this.littleWhiteBox.callGenerate === 'function') {
        await this.littleWhiteBox.callGenerate({
          message: segment.text,
          speaker: speakerValue,
          resourceId,
          contextTexts: context ? [context] : [],
        });
        this.isPlaying = true;
        this.currentSegmentId = segmentId;
        if (hasLive2D()) {
          this._startLipSyncOnPlay(segment.speaker || 'pet');
        }
        return;
      }

      console.warn(`[${SCRIPT_NAME}] TTS: 未找到可用的 TTS 接口，请确保 LittleWhiteBox 插件已安装并启用`);
    } catch (err) {
      console.error(`[${SCRIPT_NAME}] TTS播放失败:`, err);
    } finally {
      this.isLoading = false;
      this.hideLoadingIndicator();
    }
  },
};
