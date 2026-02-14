import { EMOTION_TAGS, type EmotionTag } from './constants';

export type EmotionMotionOverride = {
  enabled: boolean;
  group: string;
  index: number;
};

export type EmotionConfig = {
  tag: EmotionTag;
  aliases: string[];
  ttsContext: string;
  live2dExpression: string;
  live2dMotion: EmotionMotionOverride;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const EMOTION_TAG_SET = new Set<string>(EMOTION_TAGS as unknown as string[]);

function asEmotionTag(value: unknown): EmotionTag | null {
  const s = String(value || '').trim();
  if (!s) return null;
  return EMOTION_TAG_SET.has(s) ? (s as EmotionTag) : null;
}

const DEFAULT_ALIASES: Record<EmotionTag, string[]> = {
  默认: ['普通', 'normal', 'default', 'neutral', 'idle', 'base'],
  微笑: ['开心', '笑', 'smile', 'happy', 'joy', 'glad'],
  生气: ['愤怒', 'angry', 'mad', 'rage'],
  难过: ['伤心', 'sad', 'cry', 'sorrow', 'upset'],
  惊讶: ['震惊', 'surprised', 'shock', 'amazed', 'wow'],
  嘲讽: ['轻蔑', 'smirk', 'mock', 'sneer', 'tease', 'sarcastic'],
  害羞: ['脸红', 'shy', 'blush', 'embarrassed', 'bashful'],
  思考: ['疑惑', 'think', 'ponder', 'confused', 'wonder', 'curious'],
  大笑: ['笑死', 'laugh', 'lol', 'haha', 'giggle', 'rofl'],
  搞怪: ['调皮', 'wink', 'playful', 'silly', 'mischievous', 'fun'],
};

function dedupAliases(aliases: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(aliases) ? aliases : []) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

export function parseAliasesText(input: unknown): string[] {
  const text = String(input || '');
  const parts = text
    .split(/[,，\n\r]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return dedupAliases(parts);
}

export function createDefaultEmotionConfigs(): EmotionConfig[] {
  return EMOTION_TAGS.map((tag) => ({
    tag,
    aliases: [...(DEFAULT_ALIASES[tag] ?? [])],
    ttsContext: '',
    live2dExpression: '',
    live2dMotion: { enabled: true, group: '', index: 0 },
  }));
}

export function normalizeEmotionConfigs(raw: unknown): EmotionConfig[] {
  const byTag = new Map<EmotionTag, EmotionConfig>();

  for (const item of Array.isArray(raw) ? raw : []) {
    if (!isRecord(item)) continue;
    const tag = asEmotionTag(item.tag);
    if (!tag) continue;
    if (byTag.has(tag)) continue;

    const live2dMotionRaw = isRecord(item.live2dMotion) ? item.live2dMotion : {};
    const enabled = (live2dMotionRaw.enabled as unknown) !== false;
    const group = String(live2dMotionRaw.group || '').trim();
    const indexRaw = Number(live2dMotionRaw.index);
    const index = Number.isFinite(indexRaw) ? Math.max(0, Math.floor(indexRaw)) : 0;

    const cfg: EmotionConfig = {
      tag,
      aliases: dedupAliases(
        Array.isArray(item.aliases)
          ? item.aliases.map((v) => String(v || '').trim()).filter(Boolean)
          : [],
      ),
      ttsContext: String(item.ttsContext || '').trim(),
      live2dExpression: String(item.live2dExpression || '').trim(),
      live2dMotion: { enabled, group, index },
    };

    byTag.set(tag, cfg);
  }

  const defaults = createDefaultEmotionConfigs();
  for (const def of defaults) {
    if (!byTag.has(def.tag)) byTag.set(def.tag, def);
  }

  return EMOTION_TAGS.map((tag) => byTag.get(tag)!).map((cfg) => ({
    tag: cfg.tag,
    aliases: dedupAliases(cfg.aliases),
    ttsContext: String(cfg.ttsContext || '').trim(),
    live2dExpression: String(cfg.live2dExpression || '').trim(),
    live2dMotion: {
      enabled: cfg.live2dMotion?.enabled !== false,
      group: String(cfg.live2dMotion?.group || '').trim(),
      index: Number.isFinite(cfg.live2dMotion?.index) ? Math.max(0, Math.floor(cfg.live2dMotion.index)) : 0,
    },
  }));
}

export function getEmotionConfigByTag(tag: EmotionTag, configs: unknown): EmotionConfig | null {
  for (const cfg of Array.isArray(configs) ? (configs as EmotionConfig[]) : []) {
    if (cfg?.tag === tag) return cfg;
  }
  return null;
}

export function resolveEmotionTag(rawTag: unknown, configs: unknown): EmotionTag | null {
  const s = String(rawTag || '').trim();
  if (!s) return null;
  const direct = asEmotionTag(s);
  if (direct) return direct;

  const needle = s.toLowerCase();
  for (const cfg of Array.isArray(configs) ? (configs as EmotionConfig[]) : []) {
    const aliases = Array.isArray(cfg?.aliases) ? cfg.aliases : [];
    for (const alias of aliases) {
      if (String(alias || '').trim().toLowerCase() === needle) {
        const tag = asEmotionTag(cfg.tag);
        if (tag) return tag;
      }
    }
  }
  return null;
}

