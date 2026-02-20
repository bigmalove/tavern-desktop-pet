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

export type GptSoVitsRefAudio = {
  id: string;
  name: string;
  path: string;
  promptText: string;
  promptLang: string;
  textLang: string;
};

export type GptSoVitsModelStoreConfig = {
  id: string;
  name: string;
  enabled: boolean;
  desc: string;
  paths: {
    gptWeightsPath: string;
    sovitsWeightsPath: string;
    defaultRefAudioPath: string;
  };
  params: {
    promptText: string;
    promptLang: string;
    textLang: string;
    textSplitMethod: string;
    speedFactor: number;
    mediaType: string;
    streamingMode: boolean;
    modelSwitchMode: GptSoVitsSwitchMode;
    setModelEndpoint: string;
    strictWeightSwitch: boolean;
  };
  refAudios: GptSoVitsRefAudio[];
  defaultRefId: string;
  expressionRefMap: Record<string, string>;
};

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
  strictWeightSwitch: boolean;
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
    textSplitMethod?: string;
    speedFactor?: number;
    mediaType?: string;
    streamingMode?: boolean;
    modelSwitchMode: GptSoVitsSwitchMode;
    setModelEndpoint: string;
    strictWeightSwitch: boolean;
  };
  gptSoVitsModel?: GptSoVitsModelStoreConfig;
};

function normalizePathSep(path: unknown): string {
  return String(path || '').replace(/\\/g, '/');
}

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

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeObject<T extends object = Record<string, any>>(value: unknown): T {
  return (value && typeof value === 'object' ? value : {}) as T;
}

function safeArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function buildGptSoVitsModelId(seed: unknown = 'model'): string {
  const base = String(seed || 'model')
    .trim()
    .replace(/[^\w\u4e00-\u9fff.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const ts = Date.now().toString(36);
  const rnd = Math.floor(Math.random() * 1e6).toString(36);
  return `${base || 'model'}_${ts}_${rnd}`;
}

function normalizeGptSoVitsRefAudio(
  ref: unknown,
  index = 0,
  defaults: Partial<GptSoVitsModelStoreConfig['params']> = {},
): GptSoVitsRefAudio | null {
  const raw = safeObject<any>(ref);
  const path = normalizePathSep(String(raw.path || raw.refAudioPath || raw.ref_audio_path || '').trim());
  if (!path) return null;

  const idRaw = String(raw.id || raw.refId || '').trim() || `ref_${index + 1}`;
  const id = idRaw.replace(/[^\w\u4e00-\u9fff.-]+/g, '_');
  const name = String(raw.name || raw.label || id || `参考音频${index + 1}`).trim() || `参考音频${index + 1}`;

  return {
    id,
    name,
    path,
    promptText: String(raw.promptText || raw.prompt_text || defaults.promptText || '').trim(),
    promptLang: String(raw.promptLang || raw.prompt_lang || defaults.promptLang || 'zh').trim() || 'zh',
    textLang: String(raw.textLang || raw.text_lang || defaults.textLang || 'auto').trim() || 'auto',
  };
}

function normalizeGptSoVitsModel(
  model: unknown,
  globalDefaults: ReturnType<typeof getGptSoVitsConfig>,
  index = 0,
): GptSoVitsModelStoreConfig | null {
  const raw = safeObject<any>(model);
  const paths = safeObject<any>(raw.paths);
  const params = safeObject<any>(raw.params);

  const name = String(raw.name || raw.modelName || raw.voice || raw.speaker || '').trim();
  if (!name) return null;

  const id =
    String(raw.id || '')
      .trim()
      .replace(/[^\w\u4e00-\u9fff.-]+/g, '_') || buildGptSoVitsModelId(name || `model_${index + 1}`);

  const modelParams: GptSoVitsModelStoreConfig['params'] = {
    promptText: String(params.promptText || params.prompt_text || raw.promptText || raw.prompt_text || '').trim(),
    promptLang:
      String(params.promptLang || params.prompt_lang || raw.promptLang || raw.prompt_lang || 'zh').trim() || 'zh',
    textLang:
      String(
        params.textLang || params.text_lang || raw.textLang || raw.text_lang || globalDefaults.textLang || 'auto',
      ).trim() || 'auto',
    textSplitMethod:
      String(
        params.textSplitMethod ||
          params.text_split_method ||
          raw.textSplitMethod ||
          raw.text_split_method ||
          globalDefaults.textSplitMethod ||
          'cut5',
      ).trim() || 'cut5',
    speedFactor: toFiniteNumber(
      params.speedFactor ?? params.speed_factor ?? raw.speedFactor ?? raw.speed_factor,
      toFiniteNumber(globalDefaults.speedFactor, 1),
    ),
    mediaType:
      String(params.mediaType || params.media_type || raw.mediaType || raw.media_type || globalDefaults.mediaType || 'wav')
        .trim() || 'wav',
    streamingMode: !!(
      params.streamingMode ??
      params.streaming_mode ??
      raw.streamingMode ??
      raw.streaming_mode ??
      globalDefaults.streamingMode
    ),
    modelSwitchMode: normalizeGptSoVitsSwitchMode(
      params.modelSwitchMode || raw.modelSwitchMode || globalDefaults.modelSwitchMode || 'set_weights',
    ),
    setModelEndpoint: normalizeSetModelEndpoint(
      params.setModelEndpoint || raw.setModelEndpoint || globalDefaults.setModelEndpoint || '/set_model',
    ),
    strictWeightSwitch: !!(params.strictWeightSwitch ?? raw.strictWeightSwitch ?? globalDefaults.strictWeightSwitch),
  };

  const gptWeightsPath = normalizePathSep(
    String(paths.gptWeightsPath || paths.gpt_weights_path || raw.gptWeightsPath || raw.gpt_weights_path || '').trim(),
  );
  const sovitsWeightsPath = normalizePathSep(
    String(
      paths.sovitsWeightsPath || paths.sovits_weights_path || raw.sovitsWeightsPath || raw.sovits_weights_path || '',
    ).trim(),
  );
  const defaultRefAudioPath = normalizePathSep(
    String(paths.defaultRefAudioPath || raw.defaultRefAudioPath || raw.refAudioPath || raw.ref_audio_path || '').trim(),
  );

  const refAudioCandidates = [
    ...safeArray(raw.refAudios),
    ...safeArray(raw.references),
    ...safeArray(raw.refAudioList),
  ];
  if (defaultRefAudioPath) {
    refAudioCandidates.unshift({
      id: String(raw.defaultRefId || 'ref_default').trim() || 'ref_default',
      name: '默认',
      path: defaultRefAudioPath,
      promptText: modelParams.promptText,
      promptLang: modelParams.promptLang,
      textLang: modelParams.textLang,
    });
  }

  const refAudios: GptSoVitsRefAudio[] = [];
  const refIds = new Set<string>();
  const refPaths = new Set<string>();
  for (const [refIndex, item] of refAudioCandidates.entries()) {
    const normalized = normalizeGptSoVitsRefAudio(item, refIndex, modelParams);
    if (!normalized) continue;
    if (refPaths.has(normalized.path)) continue;

    let nextId = normalized.id || `ref_${refAudios.length + 1}`;
    let dedupe = 2;
    while (refIds.has(nextId)) {
      nextId = `${normalized.id}_${dedupe++}`;
    }
    normalized.id = nextId;

    refIds.add(nextId);
    refPaths.add(normalized.path);
    refAudios.push(normalized);
  }

  let defaultRefId = String(raw.defaultRefId || '').trim();
  if (defaultRefId && !refAudios.some(item => item.id === defaultRefId)) {
    defaultRefId = '';
  }
  if (!defaultRefId && defaultRefAudioPath) {
    defaultRefId = refAudios.find(item => item.path === defaultRefAudioPath)?.id || '';
  }
  if (!defaultRefId && refAudios.length > 0) {
    defaultRefId = refAudios[0].id;
  }

  const resolvedDefaultRefPath =
    refAudios.find(item => item.id === defaultRefId)?.path || defaultRefAudioPath || refAudios[0]?.path || '';

  const rawMap = safeObject<any>(raw.expressionRefMap || raw.expressionMap);
  const expressionRefMap: Record<string, string> = {};
  Object.entries(rawMap).forEach(([expr, refId]) => {
    const exprText = String(expr || '').trim();
    const resolvedRefId = String(refId || '').trim();
    if (!exprText || !resolvedRefId) return;
    if (!refAudios.some(item => item.id === resolvedRefId)) return;
    expressionRefMap[exprText] = resolvedRefId;
  });

  return {
    id,
    name,
    enabled: raw.enabled !== false,
    desc: String(raw.desc || raw.description || '').trim(),
    paths: {
      gptWeightsPath,
      sovitsWeightsPath,
      defaultRefAudioPath: resolvedDefaultRefPath,
    },
    params: modelParams,
    refAudios,
    defaultRefId,
    expressionRefMap,
  };
}

function normalizeGptSoVitsModelsForStoreInternal(
  modelList: unknown,
  globalDefaults: ReturnType<typeof getGptSoVitsConfig>,
): GptSoVitsModelStoreConfig[] {
  const out: GptSoVitsModelStoreConfig[] = [];
  const idSet = new Set<string>();
  const nameSet = new Set<string>();

  for (const [index, model] of safeArray(modelList).entries()) {
    const normalized = normalizeGptSoVitsModel(model, globalDefaults, index);
    if (!normalized) continue;

    let id = normalized.id;
    while (idSet.has(id)) id = buildGptSoVitsModelId(id);
    normalized.id = id;
    idSet.add(id);

    const baseName = normalized.name;
    let nextName = baseName;
    let dedupe = 2;
    while (nameSet.has(nextName)) {
      nextName = `${baseName}_${dedupe++}`;
    }
    normalized.name = nextName;
    nameSet.add(nextName);

    out.push(normalized);
  }
  return out;
}

function buildRuntimeVoiceFromModel(
  model: GptSoVitsModelStoreConfig,
  globalCfg: ReturnType<typeof getGptSoVitsConfig>,
): TTSSpeakerVoice | null {
  if (!model || model.enabled === false) return null;

  const refs = safeArray<GptSoVitsRefAudio>(model.refAudios);
  const defaultRef =
    refs.find(item => item.id === model.defaultRefId) ||
    refs.find(item => item.path === model.paths?.defaultRefAudioPath) ||
    refs[0] ||
    null;

  const params = safeObject<GptSoVitsModelStoreConfig['params']>(model.params);
  const promptText = String(defaultRef?.promptText || params.promptText || '').trim();
  const promptLang = String(defaultRef?.promptLang || params.promptLang || 'zh').trim() || 'zh';
  const textLang = String(defaultRef?.textLang || params.textLang || globalCfg.textLang || 'auto').trim() || 'auto';

  return {
    name: model.name,
    value: model.name,
    source: TTS_PROVIDER.GPT_SOVITS_V2,
    resourceId: null,
    desc: model.desc || 'GPT-SoVITS',
    gptSoVitsModel: model,
    gptSoVits: {
      refAudioPath: String(defaultRef?.path || model.paths?.defaultRefAudioPath || '').trim(),
      promptText,
      promptLang,
      textLang,
      gptWeightsPath: String(model.paths?.gptWeightsPath || '').trim(),
      sovitsWeightsPath: String(model.paths?.sovitsWeightsPath || '').trim(),
      textSplitMethod: String(params.textSplitMethod || globalCfg.textSplitMethod || 'cut5').trim() || 'cut5',
      speedFactor: toFiniteNumber(params.speedFactor, toFiniteNumber(globalCfg.speedFactor, 1)),
      mediaType: String(params.mediaType || globalCfg.mediaType || 'wav').trim() || 'wav',
      streamingMode: !!(params.streamingMode ?? globalCfg.streamingMode),
      modelSwitchMode: normalizeGptSoVitsSwitchMode(params.modelSwitchMode || globalCfg.modelSwitchMode || 'set_weights'),
      setModelEndpoint: normalizeSetModelEndpoint(params.setModelEndpoint || globalCfg.setModelEndpoint || '/set_model'),
      strictWeightSwitch: !!(params.strictWeightSwitch ?? globalCfg.strictWeightSwitch),
    },
  };
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
    rootDir: '',
    importPathPrefix: '',
    models: [] as GptSoVitsModelStoreConfig[],
    voices: [] as unknown[],
  };

  try {
    const store = useSettingsStore();
    const cfg = store.settings.gptSoVits || ({} as any);
    const normalizedRootDir = normalizePathSep(String(cfg.rootDir || cfg.importPathPrefix || '').trim());
    const normalizedImportPrefix = normalizePathSep(String(cfg.importPathPrefix || normalizedRootDir || '').trim());
    const merged = Object.assign(Object.assign({}, defaults), cfg, {
      modelSwitchMode: normalizeGptSoVitsSwitchMode(cfg.modelSwitchMode || defaults.modelSwitchMode),
      setModelEndpoint: normalizeSetModelEndpoint(cfg.setModelEndpoint || defaults.setModelEndpoint),
      rootDir: normalizedRootDir || normalizedImportPrefix,
      importPathPrefix: normalizedImportPrefix || normalizedRootDir,
      models: Array.isArray(cfg.models) ? cfg.models : defaults.models,
      voices: Array.isArray(cfg.voices) ? cfg.voices : defaults.voices,
    });

    const normalizedModels =
      merged.models.length > 0
        ? normalizeGptSoVitsModelsForStoreInternal(merged.models, merged as any)
        : legacyVoicesToModels(merged.voices, merged as any);

    return Object.assign({}, merged, {
      models: normalizedModels,
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

  const refAudioPath = normalizePathSep(
    String(
    voice.refAudioPath ||
      voice.ref_audio_path ||
      voice.ref_audio ||
      voice.ref ||
      rawCfg.refAudioPath ||
      '',
    ).trim(),
  );
  const promptText = String(voice.promptText || voice.prompt_text || rawCfg.promptText || '').trim();
  const promptLang = String(voice.promptLang || voice.prompt_lang || rawCfg.promptLang || '').trim();
  const textLang = String(voice.textLang || voice.text_lang || rawCfg.textLang || '').trim();
  const gptWeightsPath = normalizePathSep(
    String(
    voice.gptWeightsPath || voice.gpt_weights_path || voice.gptPath || voice.gpt || rawCfg.gptWeightsPath || '',
    ).trim(),
  );
  const sovitsWeightsPath = normalizePathSep(
    String(
    voice.sovitsWeightsPath ||
      voice.sovits_weights_path ||
      voice.sovitsPath ||
      voice.sovits ||
      rawCfg.sovitsWeightsPath ||
      '',
    ).trim(),
  );
  const modelSwitchMode = normalizeGptSoVitsSwitchMode(
    voice.modelSwitchMode || voice.model_switch_mode || rawCfg.modelSwitchMode || '',
  );
  const setModelEndpoint = normalizeSetModelEndpoint(
    voice.setModelEndpoint || voice.set_model_endpoint || rawCfg.setModelEndpoint || '/set_model',
  );
  const strictWeightSwitch = !!(
    voice.strictWeightSwitch ??
    voice.strict_weight_switch ??
    rawCfg.strictWeightSwitch
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
      strictWeightSwitch,
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
    refAudioPath: normalizePathSep(String(cfg.refAudioPath || '').trim()),
    promptText: String(cfg.promptText || '').trim(),
    promptLang: String(cfg.promptLang || '').trim(),
    textLang: String(cfg.textLang || '').trim(),
    gptWeightsPath: normalizePathSep(String(cfg.gptWeightsPath || '').trim()),
    sovitsWeightsPath: normalizePathSep(String(cfg.sovitsWeightsPath || '').trim()),
    modelSwitchMode: normalizeGptSoVitsSwitchMode(cfg.modelSwitchMode || globalCfg.modelSwitchMode),
    setModelEndpoint: normalizeSetModelEndpoint(cfg.setModelEndpoint || globalCfg.setModelEndpoint),
    strictWeightSwitch: !!(cfg.strictWeightSwitch ?? globalCfg.strictWeightSwitch),
  };
}

function legacyVoicesToModels(
  voiceList: unknown,
  globalDefaults: ReturnType<typeof getGptSoVitsConfig>,
): GptSoVitsModelStoreConfig[] {
  const models: GptSoVitsModelStoreConfig[] = [];
  for (const [index, voice] of safeArray(voiceList).entries()) {
    const cfg = toGptSoVitsVoiceConfig(voice, globalDefaults);
    if (!cfg) continue;
    models.push({
      id: buildGptSoVitsModelId(cfg.name || `model_${index + 1}`),
      name: cfg.name || `模型${index + 1}`,
      enabled: true,
      desc: cfg.desc || '',
      paths: {
        gptWeightsPath: cfg.gptWeightsPath || '',
        sovitsWeightsPath: cfg.sovitsWeightsPath || '',
        defaultRefAudioPath: cfg.refAudioPath || '',
      },
      params: {
        promptText: cfg.promptText || '',
        promptLang: cfg.promptLang || 'zh',
        textLang: cfg.textLang || globalDefaults.textLang || 'auto',
        textSplitMethod: globalDefaults.textSplitMethod || 'cut5',
        speedFactor: toFiniteNumber(globalDefaults.speedFactor, 1),
        mediaType: globalDefaults.mediaType || 'wav',
        streamingMode: !!globalDefaults.streamingMode,
        modelSwitchMode: normalizeGptSoVitsSwitchMode(globalDefaults.modelSwitchMode || 'set_weights'),
        setModelEndpoint: normalizeSetModelEndpoint(globalDefaults.setModelEndpoint || '/set_model'),
        strictWeightSwitch: !!globalDefaults.strictWeightSwitch,
      },
      refAudios: cfg.refAudioPath
        ? [
            {
              id: 'ref_default',
              name: '默认',
              path: cfg.refAudioPath,
              promptText: cfg.promptText || '',
              promptLang: cfg.promptLang || 'zh',
              textLang: cfg.textLang || globalDefaults.textLang || 'auto',
            },
          ]
        : [],
      defaultRefId: cfg.refAudioPath ? 'ref_default' : '',
      expressionRefMap: {},
    });
  }
  return normalizeGptSoVitsModelsForStoreInternal(models, globalDefaults);
}

export function normalizeGptSoVitsModelsForStore(
  modelList: unknown,
  globalDefaults: ReturnType<typeof getGptSoVitsConfig> | null = null,
): GptSoVitsModelStoreConfig[] {
  const defaults = globalDefaults || getGptSoVitsConfig();
  return normalizeGptSoVitsModelsForStoreInternal(modelList, defaults);
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

type FolderImportFile = File & {
  path?: string;
  webkitRelativePath?: string;
  size?: number;
};

function getFileExtLower(name: unknown): string {
  const s = String(name || '');
  const idx = s.lastIndexOf('.');
  return idx >= 0 ? s.slice(idx + 1).toLowerCase() : '';
}

function stripFileExt(name: unknown): string {
  const s = String(name || '');
  return s.replace(/\.[^./\\]+$/, '');
}

export function isAbsoluteFileSystemPath(pathStr: unknown): boolean {
  const p = String(pathStr || '').trim();
  if (!p) return false;
  if (/^[a-zA-Z]:[\\/]/.test(p)) return true;
  if (p.startsWith('\\\\')) return true;
  if (p.startsWith('/')) return true;
  return false;
}

function joinPathPrefix(prefix: unknown, relPath: unknown): string {
  const p = String(prefix || '').trim();
  const rel = String(relPath || '').trim();
  if (!p) return rel;

  const useBackslash = p.includes('\\') && !p.includes('/');
  const sep = useBackslash ? '\\' : '/';

  const cleanPrefix = p.replace(/[\\/]+$/, '');
  const cleanRel = rel.replace(/^[\\/]+/, '');
  if (!cleanRel) return cleanPrefix;

  const normalizedPrefix = useBackslash ? cleanPrefix.replace(/[\\/]+/g, '\\') : cleanPrefix.replace(/[\\/]+/g, '/');
  const normalizedRel = useBackslash ? cleanRel.replace(/[\\/]+/g, '\\') : cleanRel.replace(/[\\/]+/g, '/');

  const lowerPrefix = normalizedPrefix.toLowerCase();
  const lowerRel = normalizedRel.toLowerCase();
  if (lowerRel === lowerPrefix || lowerRel.startsWith(`${lowerPrefix}${sep}`)) {
    return normalizedRel;
  }

  const prefixSegs = normalizedPrefix.split(/[\\/]+/).filter(Boolean);
  const relSegs = normalizedRel.split(/[\\/]+/).filter(Boolean);
  if (prefixSegs.length > 0 && relSegs.length > 0) {
    const tail = prefixSegs[prefixSegs.length - 1];
    const head = relSegs[0];
    if (tail && head && tail.toLowerCase() === head.toLowerCase()) {
      return prefixSegs.concat(relSegs.slice(1)).join(sep);
    }
  }

  return `${normalizedPrefix}${sep}${normalizedRel}`;
}

function inferLangFromText(text: unknown): string {
  const t = String(text || '');
  if (/[\u3040-\u30ff]/.test(t)) return 'ja';
  if (/[\uac00-\ud7af]/.test(t)) return 'ko';
  if (/[a-zA-Z]/.test(t) && !/[\u4e00-\u9fff]/.test(t)) return 'en';
  if (/[\u4e00-\u9fff]/.test(t)) return 'zh';
  return 'zh';
}

function cleanPromptTextFromFilenameBase(baseName: unknown): string {
  let t = String(baseName || '').trim();
  if (!t) return '';
  t = t.replace(/^[\s\uFEFF]*(?:[\(\[][^\)\]]{1,10}[\)\]])\s*/g, '');
  t = t.replace(/[.!?,]+$/g, '');
  t = t.replace(/\.{3,}/g, '...');
  return t.trim();
}

function cleanVoiceNameFromWeightsBase(baseName: unknown): string {
  let t = String(baseName || '').trim();
  if (!t) return '';

  t = t.replace(/^[A-Za-z0-9]{2,8}[_-]+/, '');
  const suffixes = [
    /[_-]v\d+(?:proplus|pro|pp|p)?$/i,
    /[_-](?:v2pp|v2p|v2|v3|v4)$/i,
    /[_-](?:proplus|pro|pp|p)$/i,
    /[_-](?:gpt|sovits|so-vits|vits)$/i,
  ];

  for (let i = 0; i < 4; i++) {
    const before = t;
    for (const re of suffixes) t = t.replace(re, '');
    if (before === t) break;
    t = t.trim();
  }
  return t.trim();
}

function pickLargestFile<T extends FolderImportFile>(files: T[]): T | null {
  if (!Array.isArray(files) || files.length === 0) return null;
  return files.slice().sort((a, b) => Number(b?.size || 0) - Number(a?.size || 0))[0] || null;
}

function pickBestAudioFile(audioFiles: FolderImportFile[]): FolderImportFile | null {
  if (!Array.isArray(audioFiles) || audioFiles.length === 0) return null;
  const candidates = audioFiles.map(file => {
    const base = stripFileExt(file.name);
    const promptText = cleanPromptTextFromFilenameBase(base);
    const ext = getFileExtLower(file.name);
    const extScore = ext === 'wav' ? 3 : ext === 'flac' ? 2 : ext === 'ogg' ? 1 : 0;
    const lenScore = Math.min(200, promptText.length);
    return { file, score: extScore * 1000 + lenScore };
  });
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.file || null;
}

function weightsStemKey(fileName: unknown): string {
  let stem = String(stripFileExt(fileName) || '').toLowerCase().trim();
  if (!stem) return '';
  stem = stem.replace(/[\s._-]+/g, '');
  stem = stem.replace(/(gpt|sovits|sovit|vits)+$/g, '');
  return stem;
}

function collectWeightCandidates(
  ckpts: FolderImportFile[],
  pths: FolderImportFile[],
): Array<{ gptFile: FolderImportFile | null; sovitsFile: FolderImportFile | null }> {
  const ckptList = Array.isArray(ckpts) ? ckpts.slice() : [];
  const pthList = Array.isArray(pths) ? pths.slice() : [];
  if (ckptList.length === 0 && pthList.length === 0) return [];

  ckptList.sort((a, b) => Number(b?.size || 0) - Number(a?.size || 0));
  pthList.sort((a, b) => Number(b?.size || 0) - Number(a?.size || 0));

  const ckptByBase = new Map<string, FolderImportFile>();
  const ckptByStem = new Map<string, FolderImportFile>();
  ckptList.forEach(file => {
    const base = stripFileExt(file.name).toLowerCase();
    if (!ckptByBase.has(base)) ckptByBase.set(base, file);
    const stem = weightsStemKey(file.name);
    if (stem && !ckptByStem.has(stem)) ckptByStem.set(stem, file);
  });

  const out: Array<{ gptFile: FolderImportFile | null; sovitsFile: FolderImportFile | null }> = [];
  const used = new Set<string>();
  const addCandidate = (gptFile: FolderImportFile | null, sovitsFile: FolderImportFile | null) => {
    if (!gptFile && !sovitsFile) return;
    const key = `${gptFile?.name || ''}::${sovitsFile?.name || ''}`.toLowerCase();
    if (used.has(key)) return;
    used.add(key);
    out.push({ gptFile: gptFile || null, sovitsFile: sovitsFile || null });
  };

  pthList.forEach(pth => {
    const base = stripFileExt(pth.name).toLowerCase();
    const matched = ckptByBase.get(base) || null;
    if (matched) addCandidate(matched, pth);
  });

  pthList.forEach(pth => {
    const stem = weightsStemKey(pth.name);
    const matched = stem ? ckptByStem.get(stem) || null : null;
    if (matched) addCandidate(matched, pth);
  });

  if (out.length === 0) {
    addCandidate(pickLargestFile(ckptList), pickLargestFile(pthList));
  }

  const usedGpt = new Set(out.map(item => item.gptFile?.name).filter(Boolean) as string[]);
  const usedSovits = new Set(out.map(item => item.sovitsFile?.name).filter(Boolean) as string[]);
  pthList.forEach(file => {
    if (!usedSovits.has(file.name)) addCandidate(null, file);
  });
  ckptList.forEach(file => {
    if (!usedGpt.has(file.name)) addCandidate(file, null);
  });

  return out;
}

export function inferGptSoVitsVoicesFromFolderFiles(
  fileList: ArrayLike<FolderImportFile> | FolderImportFile[],
  importPathPrefix = '',
): GptSoVitsVoiceStoreConfig[] {
  const files = Array.from(fileList || []).filter(Boolean);
  if (files.length === 0) return [];

  const groups = new Map<string, FolderImportFile[]>();
  for (const file of files) {
    const rel = normalizePathSep(file.webkitRelativePath || file.name || '');
    const dir = rel.split('/').slice(0, -1).join('/');
    const key = dir || '__root__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(file);
  }

  const result: GptSoVitsVoiceStoreConfig[] = [];

  for (const [dirKey, groupFiles] of groups.entries()) {
    const ckpts: FolderImportFile[] = [];
    const pths: FolderImportFile[] = [];
    const audios: FolderImportFile[] = [];

    for (const file of groupFiles) {
      const ext = getFileExtLower(file.name);
      if (ext === 'ckpt') ckpts.push(file);
      else if (ext === 'pth') pths.push(file);
      else if (['wav', 'mp3', 'flac', 'ogg', 'm4a'].includes(ext)) audios.push(file);
    }

    const audioFile = pickBestAudioFile(audios);
    const promptText = audioFile ? cleanPromptTextFromFilenameBase(stripFileExt(audioFile.name)) : '';
    const inferredLang = promptText ? inferLangFromText(promptText) : 'zh';

    const toServerPath = (file: FolderImportFile): string => {
      const abs = typeof file?.path === 'string' ? String(file.path) : '';
      if (isAbsoluteFileSystemPath(abs)) return abs;
      const rel = normalizePathSep(file?.webkitRelativePath || file?.name || '');
      return joinPathPrefix(importPathPrefix, rel);
    };

    const dirName = dirKey !== '__root__' ? dirKey.split('/').pop() || '' : '';
    const candidatesRaw = collectWeightCandidates(ckpts, pths);
    const candidates = candidatesRaw.length > 0 ? candidatesRaw : [{ gptFile: null, sovitsFile: null }];
    const usedName = new Set<string>();

    for (const pair of candidates) {
      const gptFile = pair.gptFile || null;
      const sovitsFile = pair.sovitsFile || null;
      const weightsBase = stripFileExt((sovitsFile || gptFile || audioFile || ({} as FolderImportFile)).name || '');
      const baseName = cleanVoiceNameFromWeightsBase(weightsBase) || cleanVoiceNameFromWeightsBase(dirName) || '新音色';

      let voiceName = baseName;
      let idx = 2;
      while (usedName.has(voiceName)) {
        voiceName = `${baseName}_${idx++}`;
      }
      usedName.add(voiceName);

      const voice: GptSoVitsVoiceStoreConfig = {
        name: voiceName,
        desc: '文件夹导入',
        refAudioPath: audioFile ? toServerPath(audioFile) : '',
        promptText,
        promptLang: inferredLang,
        textLang: inferredLang,
        gptWeightsPath: gptFile ? toServerPath(gptFile) : '',
        sovitsWeightsPath: sovitsFile ? toServerPath(sovitsFile) : '',
        modelSwitchMode: 'set_weights',
        setModelEndpoint: '/set_model',
        strictWeightSwitch: false,
      };

      if (voice.refAudioPath) {
        result.push(voice);
      }
    }
  }

  return result;
}

function inferExpressionTagFromAudioName(baseName: unknown): string {
  const name = String(baseName || '')
    .trim()
    .toLowerCase();
  if (!name) return '';
  const rules: Array<{ tag: string; patterns: string[] }> = [
    { tag: '开心', patterns: ['happy', 'smile', 'laugh', 'joy', '开心', '高兴', '喜悦', '愉快', '兴奋'] },
    { tag: '生气', patterns: ['angry', 'mad', 'rage', '生气', '愤怒', '恼火'] },
    { tag: '悲伤', patterns: ['sad', 'cry', 'sob', '悲伤', '难过', '伤心'] },
    { tag: '惊讶', patterns: ['surprise', 'wow', '惊讶', '震惊', '吃惊'] },
    { tag: '害羞', patterns: ['shy', 'blush', '害羞', '脸红'] },
    { tag: '冷静', patterns: ['calm', 'normal', 'neutral', '平静', '冷静', '默认'] },
  ];
  for (const rule of rules) {
    if (rule.patterns.some(pattern => name.includes(pattern))) return rule.tag;
  }
  return '';
}

export function inferGptSoVitsModelsFromFolderFiles(
  fileList: ArrayLike<FolderImportFile> | FolderImportFile[],
  importPathPrefix = '',
  importOptions: { relativeRootName?: string } = {},
): GptSoVitsModelStoreConfig[] {
  const files = Array.from(fileList || []).filter(Boolean);
  if (files.length === 0) return [];

  const normalizedImportPrefix = normalizePathSep(String(importPathPrefix || '').trim());
  const rootHintRaw = String(importOptions?.relativeRootName || '').trim();
  const normalizedRootHint = normalizePathSep(rootHintRaw).replace(/^[\\/]+|[\\/]+$/g, '');
  const normalizeRelativePath = (file: FolderImportFile): string => {
    let rel = normalizePathSep(String(file?.webkitRelativePath || file?.name || '').trim()).replace(/^[\\/]+/, '');
    if (!rel) return '';
    if (!normalizedRootHint) return rel;
    const lowerRel = rel.toLowerCase();
    const lowerRoot = normalizedRootHint.toLowerCase();
    if (lowerRel === lowerRoot || lowerRel.startsWith(`${lowerRoot}/`)) return rel;
    return `${normalizedRootHint}/${rel}`;
  };

  const groups = new Map<string, FolderImportFile[]>();
  for (const file of files) {
    const rel = normalizeRelativePath(file);
    const dir = rel.split('/').slice(0, -1).join('/');
    const key = dir || '__root__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(file);
  }

  const cfg = getGptSoVitsConfig();
  const models: GptSoVitsModelStoreConfig[] = [];

  for (const [dirKey, groupFiles] of groups.entries()) {
    const ckpts: FolderImportFile[] = [];
    const pths: FolderImportFile[] = [];
    const audios: FolderImportFile[] = [];

    for (const file of groupFiles) {
      const ext = getFileExtLower(file.name);
      if (ext === 'ckpt') ckpts.push(file);
      else if (ext === 'pth') pths.push(file);
      else if (['wav', 'mp3', 'flac', 'ogg', 'm4a'].includes(ext)) audios.push(file);
    }

    if (ckpts.length === 0 && pths.length === 0 && audios.length === 0) continue;

    const toServerPath = (file: FolderImportFile): string => {
      const abs = normalizePathSep(typeof file?.path === 'string' ? String(file.path) : '');
      if (isAbsoluteFileSystemPath(abs)) return abs;

      const rel = normalizeRelativePath(file);
      if (!rel) return '';

      const prefixed = normalizePathSep(joinPathPrefix(normalizedImportPrefix, rel));
      return prefixed || rel;
    };

    const audioCandidates = audios
      .map(file => {
        const base = stripFileExt(file.name);
        const promptText = cleanPromptTextFromFilenameBase(base);
        const inferredTag = inferExpressionTagFromAudioName(base);
        return { file, promptText, inferredTag };
      })
      .filter(item => !!item.file);
    const bestAudio = pickBestAudioFile(audios);
    const weightCandidatesRaw = collectWeightCandidates(ckpts, pths);
    const weightCandidates =
      weightCandidatesRaw.length > 0 ? weightCandidatesRaw : [{ gptFile: null, sovitsFile: null }];
    const dirName = dirKey !== '__root__' ? dirKey.split('/').pop() || '' : '';
    const groupNameUsed = new Set<string>();

    for (const pair of weightCandidates) {
      const gptFile = pair.gptFile || null;
      const sovitsFile = pair.sovitsFile || null;
      const weightsBase = stripFileExt((sovitsFile || gptFile || bestAudio || ({} as FolderImportFile)).name || '');
      const baseName = cleanVoiceNameFromWeightsBase(weightsBase) || cleanVoiceNameFromWeightsBase(dirName) || '新模型';

      let modelName = baseName;
      let idx = 2;
      while (groupNameUsed.has(modelName)) {
        modelName = `${baseName}_${idx++}`;
      }
      groupNameUsed.add(modelName);

      const refAudios: GptSoVitsRefAudio[] = [];
      const expressionRefMap: Record<string, string> = {};
      const defaultRefBase = bestAudio ? normalizePathSep(toServerPath(bestAudio)) : '';

      audioCandidates.forEach((item, audioIndex) => {
        const path = normalizePathSep(toServerPath(item.file));
        if (!path) return;
        const id = `ref_${audioIndex + 1}`;
        const name = stripFileExt(item.file.name) || `参考音频${audioIndex + 1}`;
        const text = String(item.promptText || '').trim();
        const lang = text ? inferLangFromText(text) : 'zh';
        refAudios.push({
          id,
          name,
          path,
          promptText: text,
          promptLang: lang,
          textLang: lang,
        });
        if (item.inferredTag && !expressionRefMap[item.inferredTag]) {
          expressionRefMap[item.inferredTag] = id;
        }
      });

      const defaultRef = refAudios.find(item => item.path === defaultRefBase) || refAudios[0] || null;
      const defaultPromptText = String(defaultRef?.promptText || '').trim();
      const defaultLang = defaultPromptText ? inferLangFromText(defaultPromptText) : 'zh';

      const model: GptSoVitsModelStoreConfig = {
        id: buildGptSoVitsModelId(modelName),
        name: modelName,
        enabled: true,
        desc: '文件夹导入',
        paths: {
          gptWeightsPath: gptFile ? normalizePathSep(toServerPath(gptFile)) : '',
          sovitsWeightsPath: sovitsFile ? normalizePathSep(toServerPath(sovitsFile)) : '',
          defaultRefAudioPath: defaultRef?.path || '',
        },
        params: {
          promptText: defaultPromptText,
          promptLang: defaultRef?.promptLang || defaultLang,
          textLang: defaultRef?.textLang || defaultLang,
          textSplitMethod: cfg.textSplitMethod || 'cut5',
          speedFactor: toFiniteNumber(cfg.speedFactor, 1),
          mediaType: cfg.mediaType || 'wav',
          streamingMode: !!cfg.streamingMode,
          modelSwitchMode: normalizeGptSoVitsSwitchMode(cfg.modelSwitchMode || 'set_weights'),
          setModelEndpoint: normalizeSetModelEndpoint(cfg.setModelEndpoint || '/set_model'),
          strictWeightSwitch: !!cfg.strictWeightSwitch,
        },
        refAudios,
        defaultRefId: defaultRef?.id || '',
        expressionRefMap,
      };

      if (model.paths.defaultRefAudioPath) {
        models.push(model);
      }
    }
  }

  return normalizeGptSoVitsModelsForStore(models, cfg);
}

export async function getGptSoVitsVoiceListAsync(): Promise<TTSSpeakerVoice[]> {
  const cfg = getGptSoVitsConfig();
  const modelList = safeArray<GptSoVitsModelStoreConfig>(cfg.models);
  if (modelList.length > 0) {
    return modelList.map(model => buildRuntimeVoiceFromModel(model, cfg)).filter(Boolean) as TTSSpeakerVoice[];
  }
  const list = Array.isArray(cfg.voices) ? cfg.voices : [];
  return list.map(normalizeGptSoVitsVoice).filter(Boolean) as TTSSpeakerVoice[];
}

export function getGptSoVitsVoiceList(): TTSSpeakerVoice[] {
  try {
    const cfg = getGptSoVitsConfig();
    const modelList = safeArray<GptSoVitsModelStoreConfig>(cfg.models);
    if (modelList.length > 0) {
      return modelList.map(model => buildRuntimeVoiceFromModel(model, cfg)).filter(Boolean) as TTSSpeakerVoice[];
    }
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
