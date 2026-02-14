import { klona } from 'klona';
import { defineStore } from 'pinia';
import { ref, watchEffect } from 'vue';
import { z } from 'zod';
import { COMMENT_STYLES, DEFAULTS, EMOTION_TAGS } from './constants';
import { normalizeEmotionConfigs } from './emotion';
import { error as logError, warn } from '../utils/dom';

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deleteAtPath(target: any, path: (string | number)[]): void {
  if (!target || typeof target !== 'object') return;
  if (path.length === 0) return;

  let current: any = target;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!current || typeof current !== 'object') return;
    current = current[key as any];
  }

  const last = path[path.length - 1];
  if (!current || typeof current !== 'object') return;
  if (Array.isArray(current) && typeof last === 'number') {
    current[last] = undefined;
    return;
  }
  delete current[last as any];
}

function parseSettings(raw: unknown): Settings {
  const rawObject = isRecord(raw) ? raw : {};
  const first = SettingsSchema.safeParse(rawObject);
  if (first.success) return first.data;

  const cleaned = klona(rawObject);
  for (const issue of first.error.issues) {
    deleteAtPath(cleaned, issue.path);
  }

  const second = SettingsSchema.safeParse(cleaned);
  if (second.success) {
    warn('检测到非法设置，已自动修正为默认值', first.error.issues);
    return second.data;
  }

  logError('设置解析失败，已回退默认值', first.error);
  return SettingsSchema.parse({});
}

/** 设置 Schema */
const SettingsSchema = z
  .object({
    // API 配置
    apiMode: z.enum(['custom', 'tavern']).default('tavern'),
    apiConfig: z
      .object({
        url: z.string().default(''),
        apiKey: z.string().default(''),
        model: z.string().default('gpt-4o-mini'),
        source: z.string().default('openai'),
        max_tokens: z.number().min(1).max(4096).default(DEFAULTS.MAX_TOKENS),
        temperature: z.number().min(0).max(2).default(DEFAULTS.TEMPERATURE),
        frequency_penalty: z.number().min(-2).max(2).default(DEFAULTS.FREQUENCY_PENALTY),
        presence_penalty: z.number().min(-2).max(2).default(DEFAULTS.PRESENCE_PENALTY),
        top_p: z.number().min(0).max(1).default(DEFAULTS.TOP_P),
        top_k: z.number().min(0).max(500).default(DEFAULTS.TOP_K),
        usePresetSampling: z.boolean().default(false),
      })
      .default({}),

    // Live2D 配置
    modelPath: z.string().default(DEFAULTS.MODEL_PATH),
    useCdn: z.boolean().default(true),
    petPosition: z
      .object({
        x: z.number().default(DEFAULTS.PET_POSITION.x),
        y: z.number().default(DEFAULTS.PET_POSITION.y),
      })
      .default({}),
    petScale: z.number().min(0.1).max(3).default(DEFAULTS.PET_SCALE),
    autoMotionLoop: z.boolean().default(DEFAULTS.AUTO_MOTION_LOOP),

    // 吐槽配置
    commentStyle: z.enum(COMMENT_STYLES).default(DEFAULTS.COMMENT_STYLE),
    customPrompt: z.string().default(''),
    autoTrigger: z.boolean().default(DEFAULTS.AUTO_TRIGGER),
    triggerInterval: z.number().min(1).max(100).default(DEFAULTS.TRIGGER_INTERVAL),
    triggerProbability: z.number().min(0).max(100).default(DEFAULTS.TRIGGER_PROBABILITY),
    maxChatContext: z.number().min(1).max(50).default(DEFAULTS.MAX_CHAT_CONTEXT),

    // 表情 COT 配置
    emotionCotEnabled: z.boolean().default(true),
    emotionCotStripFromText: z.boolean().default(true),
    emotionConfigs: z
      .array(
        z
          .object({
            tag: z.enum(EMOTION_TAGS).default('默认'),
            aliases: z.array(z.string()).default([]),
            ttsContext: z.string().default(''),
            live2dExpression: z.string().default(''),
            live2dMotion: z
              .object({
                enabled: z.boolean().default(true),
                group: z.string().default(''),
                index: z.number().min(0).max(999).default(0),
              })
              .default({}),
          })
          .default({}),
      )
      .default([]),

    // TTS 配置（参考 galgame 通用生成器的 tts 模块）
    ttsProvider: z.enum(['littlewhitebox', 'gpt_sovits_v2']).default('littlewhitebox'),
    ttsAutoPlay: z.boolean().default(true),
    ttsDefaultSpeaker: z.string().default(''),
    lipSyncManualParamsEnabled: z.boolean().default(false),
    lipSyncManualParamIds: z.array(z.string()).default([]),
    gptSoVits: z
      .object({
        apiUrl: z.string().default('http://127.0.0.1:9880'),
        endpoint: z.string().default('/tts'),
        useCorsProxy: z.boolean().default(true),
        mediaType: z.enum(['wav', 'ogg', 'raw']).default('wav'),
        streamingMode: z.boolean().default(true),
        textLang: z.string().default('auto'),
        textSplitMethod: z.string().default('cut5'),
        speedFactor: z.number().min(0.1).max(3).default(1),
        strictWeightSwitch: z.boolean().default(false),
        probeOnAudioError: z.boolean().default(false),
        modelSwitchMode: z.enum(['none', 'set_model', 'set_weights']).default('set_weights'),
        setModelEndpoint: z.string().default('/set_model'),
        importPathPrefix: z.string().default(''),
        voices: z
          .array(
            z
              .object({
                name: z.string().default(''),
                desc: z.string().default(''),
                refAudioPath: z.string().default(''),
                promptText: z.string().default(''),
                promptLang: z.string().default(''),
                textLang: z.string().default(''),
                gptWeightsPath: z.string().default(''),
                sovitsWeightsPath: z.string().default(''),
                modelSwitchMode: z.enum(['none', 'set_model', 'set_weights']).default('set_weights'),
                setModelEndpoint: z.string().default('/set_model'),
              })
              .default({}),
          )
          .default([]),
      })
      .default({}),
  })
  .default({});

export type Settings = z.infer<typeof SettingsSchema>;

/** Pinia 设置 Store */
export const useSettingsStore = defineStore('desktop-pet-settings', () => {
  const raw = getVariables({ type: 'script', script_id: getScriptId() });
  const parsed = parseSettings(raw);

  // 迁移旧的 Eikanya CDN 模型路径到新的 CDN
  if (
    parsed.modelPath.includes('live2d-widget-model/') ||
    parsed.modelPath.includes('Live2D/Samples/')
  ) {
    parsed.modelPath = DEFAULTS.MODEL_PATH;
  }

  // jsDelivr / raw 都支持；加载失败时会在 Live2DManager 内部自动尝试镜像地址
  // 补齐表情配置（按固定列表）
  parsed.emotionConfigs = normalizeEmotionConfigs(parsed.emotionConfigs);

  const settings = ref<Settings>(parsed);

  // 自动持久化到脚本变量
  watchEffect(() => {
    replaceVariables(klona(settings.value), { type: 'script', script_id: getScriptId() });
  });

  /** 更新部分设置 */
  function updateSettings(partial: Partial<Settings>) {
    settings.value = SettingsSchema.parse({ ...klona(settings.value), ...partial });
    settings.value.emotionConfigs = normalizeEmotionConfigs(settings.value.emotionConfigs);
  }

  /** 重置为默认值 */
  function resetSettings() {
    const next = SettingsSchema.parse({});
    next.emotionConfigs = normalizeEmotionConfigs(next.emotionConfigs);
    settings.value = next;
  }

  return { settings, updateSettings, resetSettings };
});
