import type { EmotionTag } from '../core/constants';
import { resolveEmotionTag, type EmotionConfig } from '../core/emotion';

const RE_THINK_CLOSED = /<(think|thinking)>[\s\S]*?<\/\1>/gi;
const RE_THINK_UNCLOSED = /<(think|thinking)>[\s\S]*$/gi;

export type EmotionCotParseResult = {
  cleanText: string;
  rawTag: string | null;
  normalizedTag: EmotionTag | null;
  context: string | null;
};

export function stripThinkBlocks(input: unknown): string {
  const text = String(input || '');
  return text.replace(RE_THINK_CLOSED, '').replace(RE_THINK_UNCLOSED, '');
}

function parseBracketContent(bracketContent: string): { rawTag: string; context: string | null } {
  const content = String(bracketContent || '').trim();
  if (!content) return { rawTag: '', context: null };

  const pipeParts = content.split('|');
  const exprVoicePart = (pipeParts[0] || '').trim();
  const context = (pipeParts[1] || '').trim();

  const expression = (exprVoicePart.split(',')[0] || '').trim();
  return { rawTag: expression, context: context || null };
}

function isPendingPrefix(text: string): boolean {
  const t = String(text || '').trimStart();
  if (!t) return false;

  if (t.startsWith('[')) {
    const close = t.indexOf(']');
    if (close === -1) return true;
    const body = t.slice(close + 1);
    return !body.trim();
  }

  const open = t.indexOf('[');
  if (open > 0 && open < 30) {
    const close = t.indexOf(']', open + 1);
    if (close === -1) return true;
    const after = t.slice(close + 1);
    if (!/^\s*[:：]/.test(after)) return true;
    const body = after.replace(/^\s*[:：]\s*/, '');
    return !body.trim();
  }

  return false;
}

export function parseEmotionCotText(
  input: unknown,
  options: {
    enabled: boolean;
    stripFromText: boolean;
    configs: EmotionConfig[];
  },
): EmotionCotParseResult {
  const rawText = stripThinkBlocks(input);

  if (!options.enabled) {
    return {
      cleanText: rawText,
      rawTag: null,
      normalizedTag: null,
      context: null,
    };
  }

  if (isPendingPrefix(rawText)) {
    return {
      cleanText: '',
      rawTag: null,
      normalizedTag: null,
      context: null,
    };
  }

  // Speaker 语法: 任意名[表情|语气]: 正文
  const speakerMatch = rawText.match(/^\s*([^\[\]\n\r]{1,40})\s*\[([^\]]+)\]\s*[:：]\s*([\s\S]*)$/);
  if (speakerMatch) {
    const bracketContent = speakerMatch[2] || '';
    const body = speakerMatch[3] || '';
    const { rawTag, context } = parseBracketContent(bracketContent);
    const normalizedTag = resolveEmotionTag(rawTag, options.configs);

    return {
      cleanText: normalizedTag && options.stripFromText ? body.trimStart() : rawText,
      rawTag: rawTag || null,
      normalizedTag,
      context,
    };
  }

  // 前缀语法: [表情|语气] 正文
  const prefixMatch = rawText.match(/^\s*\[([^\]]+)\]\s*([\s\S]*)$/);
  if (prefixMatch) {
    const bracketContent = prefixMatch[1] || '';
    const body = prefixMatch[2] || '';
    const { rawTag, context } = parseBracketContent(bracketContent);
    const normalizedTag = resolveEmotionTag(rawTag, options.configs);

    return {
      cleanText: normalizedTag && options.stripFromText ? body.trimStart() : rawText,
      rawTag: rawTag || null,
      normalizedTag,
      context,
    };
  }

  return {
    cleanText: rawText,
    rawTag: null,
    normalizedTag: null,
    context: null,
  };
}
