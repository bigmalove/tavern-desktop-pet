import { SCRIPT_NAME } from '../core/constants';
import { useSettingsStore } from '../core/settings';
import { fetchEdgeVoices, getEdgeFallbackVoices } from './edge-tts-direct';

// ============================================
// TTS 音色配置 (Providers)
// 完全参考: galgame通用生成器/src/audio/tts-config.js
// ============================================

export const TTS_PROVIDER = {
  LITTLEWHITEBOX: 'littlewhitebox',
  GPT_SOVITS_V2: 'gpt_sovits_v2',
  EDGE_TTS_DIRECT: 'edge_tts_direct',
} as const;

export type TTSProvider = (typeof TTS_PROVIDER)[keyof typeof TTS_PROVIDER];

export type GptSoVitsSwitchMode = 'none' | 'set_model' | 'set_weights';

export type GptSoVitsVoiceStoreConfig = {
  name: string;
  desc: string;
  refAudioPath: string;
  promptText: string;
  promptLang: string;
  textLang: string;
  gptWeightsPath: string;
  sovitsWeightsPath: string;
  modelSwitchMode: GptSoVitsSwitchMode;
  setModelEndpoint: string;
};

export type TTSSpeakerVoice = {
  name: string;
  value: string;
  source: string;
  resourceId: string | null;
  desc: string;
  gptSoVits?: {
    refAudioPath: string;
    promptText: string;
    promptLang: string;
    textLang: string;
    gptWeightsPath: string;
    sovitsWeightsPath: string;
    modelSwitchMode: GptSoVitsSwitchMode;
    setModelEndpoint: string;
  };
};

function getTopWindow(): Window {
  try {
    return window.parent ?? window;
  } catch {
    return window;
  }
}

function getStoragePrefix(): string {
  try {
    if (typeof getScriptId === 'function') {
      const id = String(getScriptId() ?? '').trim();
      if (id) return id;
    }
  } catch {
    // ignore
  }
  return SCRIPT_NAME;
}

function getTtsEnabledKey(): string {
  return `${getStoragePrefix()}_tts_enabled`;
}

function getCharTtsVoiceKey(): string {
  return `${getStoragePrefix()}_char_tts_voice`;
}

export function normalizeGptSoVitsSwitchMode(mode: unknown): GptSoVitsSwitchMode {
  const s = String(mode || '').trim().toLowerCase();
  if (s === 'none' || s === 'off' || s === 'disabled') return 'none';
  if (s === 'set_model' || s === 'model') return 'set_model';
  return 'set_weights';
}

function normalizeSetModelEndpoint(endpoint: unknown): string {
  const raw = String(endpoint || '').trim();
  if (!raw) return '/set_model';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

export function getTTSProvider(): TTSProvider {
  try {
    const store = useSettingsStore();
    return (store.settings.ttsProvider as TTSProvider) || TTS_PROVIDER.LITTLEWHITEBOX;
  } catch {
    return TTS_PROVIDER.LITTLEWHITEBOX;
  }
}

export function getGptSoVitsConfig() {
  const defaults = {
    apiUrl: 'http://127.0.0.1:9880',
    endpoint: '/tts',
    useCorsProxy: true,
    mediaType: 'wav',
    streamingMode: false,
    textLang: 'auto',
    textSplitMethod: 'cut5',
    speedFactor: 1,
    strictWeightSwitch: false,
    probeOnAudioError: false,
    modelSwitchMode: 'set_weights' as GptSoVitsSwitchMode,
    setModelEndpoint: '/set_model',
    importPathPrefix: '',
    voices: [] as unknown[],
  };

  try {
    const store = useSettingsStore();
    const cfg = store.settings.gptSoVits || ({} as any);
    return Object.assign(Object.assign({}, defaults), cfg, {
      modelSwitchMode: normalizeGptSoVitsSwitchMode(cfg.modelSwitchMode || defaults.modelSwitchMode),
      setModelEndpoint: normalizeSetModelEndpoint(cfg.setModelEndpoint || defaults.setModelEndpoint),
      voices: Array.isArray(cfg.voices) ? cfg.voices : defaults.voices,
    });
  } catch {
    return defaults;
  }
}

export function normalizeGptSoVitsVoice(voice: any): TTSSpeakerVoice | null {
  if (!voice) return null;
  const rawCfg = voice?.gptSoVits || {};
  const name = String(voice.name || voice.voice || voice.speaker || rawCfg.name || '').trim();
  if (!name) return null;

  const refAudioPath = String(
    voice.refAudioPath ||
      voice.ref_audio_path ||
      voice.ref_audio ||
      voice.ref ||
      rawCfg.refAudioPath ||
      '',
  ).trim();
  const promptText = String(voice.promptText || voice.prompt_text || rawCfg.promptText || '').trim();
  const promptLang = String(voice.promptLang || voice.prompt_lang || rawCfg.promptLang || '').trim();
  const textLang = String(voice.textLang || voice.text_lang || rawCfg.textLang || '').trim();
  const gptWeightsPath = String(
    voice.gptWeightsPath || voice.gpt_weights_path || voice.gptPath || voice.gpt || rawCfg.gptWeightsPath || '',
  ).trim();
  const sovitsWeightsPath = String(
    voice.sovitsWeightsPath ||
      voice.sovits_weights_path ||
      voice.sovitsPath ||
      voice.sovits ||
      rawCfg.sovitsWeightsPath ||
      '',
  ).trim();
  const modelSwitchMode = normalizeGptSoVitsSwitchMode(
    voice.modelSwitchMode || voice.model_switch_mode || rawCfg.modelSwitchMode || '',
  );
  const setModelEndpoint = normalizeSetModelEndpoint(
    voice.setModelEndpoint || voice.set_model_endpoint || rawCfg.setModelEndpoint || '/set_model',
  );
  const desc = String(voice.desc || voice.description || '').trim();

  return {
    name,
    value: name,
    source: TTS_PROVIDER.GPT_SOVITS_V2,
    resourceId: null,
    desc: desc || 'GPT-SoVITS',
    gptSoVits: {
      refAudioPath,
      promptText,
      promptLang,
      textLang,
      gptWeightsPath,
      sovitsWeightsPath,
      modelSwitchMode,
      setModelEndpoint,
    },
  };
}

function toGptSoVitsVoiceConfig(
  voice: any,
  globalDefaults: ReturnType<typeof getGptSoVitsConfig> | null = null,
): GptSoVitsVoiceStoreConfig | null {
  const normalized = normalizeGptSoVitsVoice(voice);
  if (!normalized) return null;
  const cfg = normalized.gptSoVits || ({} as any);
  const globalCfg = globalDefaults || getGptSoVitsConfig();
  const desc = String(voice?.desc || voice?.description || '').trim();

  return {
    name: normalized.name,
    desc,
    refAudioPath: String(cfg.refAudioPath || '').trim(),
    promptText: String(cfg.promptText || '').trim(),
    promptLang: String(cfg.promptLang || '').trim(),
    textLang: String(cfg.textLang || '').trim(),
    gptWeightsPath: String(cfg.gptWeightsPath || '').trim(),
    sovitsWeightsPath: String(cfg.sovitsWeightsPath || '').trim(),
    modelSwitchMode: normalizeGptSoVitsSwitchMode(cfg.modelSwitchMode || globalCfg.modelSwitchMode),
    setModelEndpoint: normalizeSetModelEndpoint(cfg.setModelEndpoint || globalCfg.setModelEndpoint),
  };
}

export function isGptSoVitsVoiceUsable(voice: any): boolean {
  const cfg = toGptSoVitsVoiceConfig(voice);
  return !!String(cfg?.refAudioPath || '').trim();
}

export function normalizeGptSoVitsVoicesForStore(
  voiceList: any,
  globalDefaults: ReturnType<typeof getGptSoVitsConfig> | null = null,
) {
  const out: GptSoVitsVoiceStoreConfig[] = [];
  let ignoredCount = 0;
  let missingRefCount = 0;

  for (const voice of Array.isArray(voiceList) ? voiceList : []) {
    const cfg = toGptSoVitsVoiceConfig(voice, globalDefaults);
    if (!cfg) {
      ignoredCount += 1;
      continue;
    }
    if (!cfg.refAudioPath) missingRefCount += 1;
    out.push(cfg);
  }

  return { voices: out, ignoredCount, missingRefCount };
}

export function pickFirstUsableGptSoVitsVoice(voiceList: any): TTSSpeakerVoice | null {
  for (const voice of Array.isArray(voiceList) ? voiceList : []) {
    if (isGptSoVitsVoiceUsable(voice)) return voice;
  }
  return null;
}

export async function getGptSoVitsVoiceListAsync(): Promise<TTSSpeakerVoice[]> {
  const cfg = getGptSoVitsConfig();
  const list = Array.isArray(cfg.voices) ? cfg.voices : [];
  return list.map(normalizeGptSoVitsVoice).filter(Boolean) as TTSSpeakerVoice[];
}

export function getGptSoVitsVoiceList(): TTSSpeakerVoice[] {
  try {
    const cfg = getGptSoVitsConfig();
    const list = Array.isArray(cfg.voices) ? cfg.voices : [];
    return list.map(normalizeGptSoVitsVoice).filter(Boolean) as TTSSpeakerVoice[];
  } catch {
    return [];
  }
}

// LittleWhiteBox TTS 缓存
let _lwbTtsCache: TTSSpeakerVoice[] | null = null;
let _lwbTtsCacheTime = 0;
const LWB_TTS_CACHE_MS = 5000;

let _edgeTtsCache: TTSSpeakerVoice[] | null = null;
let _edgeTtsCacheTime = 0;
const EDGE_TTS_CACHE_MS = 2 * 60 * 1000;

export async function getEdgeDirectVoiceListAsync(): Promise<TTSSpeakerVoice[]> {
  const now = Date.now();
  if (_edgeTtsCache && now - _edgeTtsCacheTime <= EDGE_TTS_CACHE_MS) {
    return _edgeTtsCache;
  }

  try {
    const voices = await fetchEdgeVoices();
    if (voices.length > 0) {
      _edgeTtsCache = voices;
      _edgeTtsCacheTime = now;
      return voices;
    }
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] EdgeTTS 直连音色拉取失败，使用本地兜底:`, e);
  }

  const fallback = getEdgeFallbackVoices();
  _edgeTtsCache = fallback;
  _edgeTtsCacheTime = now;
  return fallback;
}

export function getEdgeDirectVoiceList(): TTSSpeakerVoice[] {
  if (_edgeTtsCache && _edgeTtsCache.length > 0) {
    return _edgeTtsCache;
  }
  return getEdgeFallbackVoices();
}

async function fetchLittleWhiteBoxTTSConfig(): Promise<any[] | null> {
  try {
    const response = await fetch('/user/files/LittleWhiteBox_TTS.json', { cache: 'no-cache' });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.volc?.mySpeakers || null;
  } catch (e) {
    console.log(`[${SCRIPT_NAME}] 获取 LittleWhiteBox TTS 配置失败:`, e);
    return null;
  }
}

export async function getTTSVoiceListAsync(): Promise<TTSSpeakerVoice[]> {
  const provider = getTTSProvider();
  if (provider === TTS_PROVIDER.GPT_SOVITS_V2) {
    return getGptSoVitsVoiceListAsync();
  }
  if (provider === TTS_PROVIDER.EDGE_TTS_DIRECT) {
    return getEdgeDirectVoiceListAsync();
  }

  const now = Date.now();
  if (!_lwbTtsCache || now - _lwbTtsCacheTime > LWB_TTS_CACHE_MS) {
    const mySpeakers = await fetchLittleWhiteBoxTTSConfig();
    if (mySpeakers && mySpeakers.length > 0) {
      _lwbTtsCache = mySpeakers.map((s: any) => ({
        name: s.name,
        value: s.value,
        source: s.source || (isFreeVoice(s.value) ? 'free' : 'auth'),
        resourceId: s.resourceId || inferResourceId(s.value),
        desc: getVoiceDesc(s.value),
      }));
      _lwbTtsCacheTime = now;
      return _lwbTtsCache;
    }
  } else if (_lwbTtsCache) {
    return _lwbTtsCache;
  }

  const topAny: any = getTopWindow() as any;
  const xbTts = topAny?.xiaobaixTts || (window as any)?.xiaobaixTts;
  if (xbTts?.getConfig) {
    const config = xbTts.getConfig();
    const mySpeakers = config?.volc?.mySpeakers || [];
    if (mySpeakers.length > 0) {
      return mySpeakers.map((s: any) => ({
        name: s.name,
        value: s.value,
        source: s.source || (isFreeVoice(s.value) ? 'free' : 'auth'),
        resourceId: s.resourceId || inferResourceId(s.value),
        desc: getVoiceDesc(s.value),
      }));
    }
  }

  const xbVoiceData = topAny?.XB_TTS_VOICE_DATA || (window as any)?.XB_TTS_VOICE_DATA;
  if (Array.isArray(xbVoiceData) && xbVoiceData.length > 0) {
    return xbVoiceData.slice(0, 20).map((v: any) => ({
      name: v.name,
      value: v.value,
      source: inferSource(v.value),
      resourceId: inferResourceId(v.value),
      desc: v.scene || '预设音色',
    }));
  }

  return getDefaultFreeVoices();
}

export function getTTSVoiceList(): TTSSpeakerVoice[] {
  const provider = getTTSProvider();
  if (provider === TTS_PROVIDER.GPT_SOVITS_V2) {
    return getGptSoVitsVoiceList();
  }
  if (provider === TTS_PROVIDER.EDGE_TTS_DIRECT) {
    return getEdgeDirectVoiceList();
  }

  if (_lwbTtsCache) {
    return _lwbTtsCache;
  }

  const topAny: any = getTopWindow() as any;
  const xbTts = topAny?.xiaobaixTts || (window as any)?.xiaobaixTts;
  if (xbTts?.getConfig) {
    const config = xbTts.getConfig();
    const mySpeakers = config?.volc?.mySpeakers || [];
    if (mySpeakers.length > 0) {
      return mySpeakers.map((s: any) => ({
        name: s.name,
        value: s.value,
        source: s.source || (isFreeVoice(s.value) ? 'free' : 'auth'),
        resourceId: s.resourceId || inferResourceId(s.value),
        desc: getVoiceDesc(s.value),
      }));
    }
  }

  const xbVoiceData = topAny?.XB_TTS_VOICE_DATA || (window as any)?.XB_TTS_VOICE_DATA;
  if (Array.isArray(xbVoiceData) && xbVoiceData.length > 0) {
    return xbVoiceData.slice(0, 20).map((v: any) => ({
      name: v.name,
      value: v.value,
      source: inferSource(v.value),
      resourceId: inferResourceId(v.value),
      desc: v.scene || '预设音色',
    }));
  }

  return getDefaultFreeVoices();
}

function isFreeVoice(value: string): boolean {
  const freeVoices = [
    'female_1',
    'female_2',
    'female_3',
    'female_4',
    'female_5',
    'female_6',
    'female_7',
    'male_1',
    'male_2',
    'male_3',
    'male_4',
  ];
  return freeVoices.includes(value);
}

function inferSource(value: string): string {
  return isFreeVoice(value) ? 'free' : 'auth';
}

export function inferResourceId(value: string): string {
  const lower = (value || '').toLowerCase();
  if (lower.startsWith('icl_') || lower.startsWith('s_')) return 'seed-icl-2.0';
  if (
    lower.startsWith('saturn_') ||
    lower.startsWith('uranus_') ||
    lower.includes('_saturn_') ||
    lower.includes('_uranus_')
  ) {
    return 'seed-tts-2.0';
  }
  return 'seed-tts-1.0';
}

function getVoiceDesc(value: string): string {
  const descMap: Record<string, string> = {
    female_1: '温柔少女(免费)',
    female_2: '清冷女声(免费)',
    female_3: '成熟御姐(免费)',
    female_4: '元气少女(免费)',
    female_5: '甜美声线(免费)',
    female_6: '邻家女孩(免费)',
    female_7: '活泼萝莉(免费)',
    male_1: '沉稳男声(免费)',
    male_2: '儒雅公子(免费)',
    male_3: '阳光少年(免费)',
    male_4: '磁性低音(免费)',
  };
  return descMap[value] || '自定义音色';
}

function getDefaultFreeVoices(): TTSSpeakerVoice[] {
  return [
    { name: '桃夭', value: 'female_1', source: 'free', resourceId: null, desc: '温柔少女(免费)' },
    { name: '夜枭', value: 'male_1', source: 'free', resourceId: null, desc: '沉稳男声(免费)' },
    { name: '霜华', value: 'female_2', source: 'free', resourceId: null, desc: '清冷女声(免费)' },
    { name: '顾姐', value: 'female_3', source: 'free', resourceId: null, desc: '成熟御姐(免费)' },
    { name: '苏菲', value: 'female_4', source: 'free', resourceId: null, desc: '元气少女(免费)' },
    { name: '嘉欣', value: 'female_5', source: 'free', resourceId: null, desc: '甜美声线(免费)' },
    { name: '青梅', value: 'female_6', source: 'free', resourceId: null, desc: '邻家女孩(免费)' },
    { name: '可莉', value: 'female_7', source: 'free', resourceId: null, desc: '活泼萝莉(免费)' },
    { name: '君泽', value: 'male_2', source: 'free', resourceId: null, desc: '儒雅公子(免费)' },
    { name: '沐阳', value: 'male_3', source: 'free', resourceId: null, desc: '阳光少年(免费)' },
    { name: '梓辛', value: 'male_4', source: 'free', resourceId: null, desc: '磁性低音(免费)' },
  ];
}

export async function resolveVoiceByName(voiceName: string): Promise<TTSSpeakerVoice | null> {
  if (!voiceName) return null;
  const voiceList = await getTTSVoiceListAsync();
  let voice = voiceList.find(v => v.name === voiceName);
  if (voice) return voice;
  voice = voiceList.find(v => v.value === voiceName);
  if (voice) return voice;
  const provider = getTTSProvider();
  const defaultVoice =
    provider === TTS_PROVIDER.GPT_SOVITS_V2
      ? (pickFirstUsableGptSoVitsVoice(voiceList) || voiceList[0])
      : provider === TTS_PROVIDER.EDGE_TTS_DIRECT
        ? voiceList[0]
        : voiceList[0];
  if (defaultVoice) {
    console.warn(`[${SCRIPT_NAME}] 未找到音色 "${voiceName}"，使用默认: ${defaultVoice.name}`);
    return defaultVoice;
  }
  return null;
}

// TTS_VOICE_LIST getter 兼容（挂到顶层窗口，方便与其他脚本一致）
try {
  Object.defineProperty(getTopWindow() as any, 'TTS_VOICE_LIST', {
    get: getTTSVoiceList,
    configurable: true,
  });
} catch {
  // ignore
}

export function getTTSEnabled(): boolean {
  try {
    const saved = localStorage.getItem(getTtsEnabledKey());
    if (saved === null) return true;
    return saved === 'true';
  } catch {
    return true;
  }
}

export function setTTSEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(getTtsEnabledKey(), String(enabled));
  } catch (e) {
    console.error(`[${SCRIPT_NAME}] 保存TTS启用状态失败:`, e);
  }
}

export function getCharacterTTSVoice(characterId: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(getCharTtsVoiceKey()) || '{}');
    return map[characterId] || null;
  } catch {
    return null;
  }
}

export function setCharacterTTSVoice(characterId: string, voiceName: string | null): void {
  try {
    const map = JSON.parse(localStorage.getItem(getCharTtsVoiceKey()) || '{}');
    if (voiceName) {
      map[characterId] = voiceName;
    } else {
      delete map[characterId];
    }
    localStorage.setItem(getCharTtsVoiceKey(), JSON.stringify(map));
  } catch (e) {
    console.error(`[${SCRIPT_NAME}] 保存角色TTS音色失败:`, e);
  }
}

export function getAllCharacterTTSVoices(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(getCharTtsVoiceKey()) || '{}');
  } catch {
    return {};
  }
}
