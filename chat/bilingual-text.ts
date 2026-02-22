const JP_SPLIT_MARKER_RE = /【\s*JP\s*】/i;

export type ZhJaSplitResult = {
  displayText: string;
  ttsText: string;
  hasJa: boolean;
};

/**
 * 双语模式下拆分“显示文本”和“TTS 文本”。
 * 约定格式：中文文本【JP】日文文本
 */
export function splitZhJaForDisplayAndTts(input: unknown, enabled: boolean): ZhJaSplitResult {
  const raw = String(input ?? '');
  if (!enabled) {
    return {
      displayText: raw,
      ttsText: raw,
      hasJa: false,
    };
  }

  const matched = raw.match(JP_SPLIT_MARKER_RE);
  if (!matched || matched.index === undefined) {
    return {
      displayText: raw,
      ttsText: raw,
      hasJa: false,
    };
  }

  const markerStart = matched.index;
  const markerEnd = markerStart + matched[0].length;
  const zhPart = raw.slice(0, markerStart).trim();
  const jaPart = raw.slice(markerEnd).trim();
  const fallback = raw.trim();

  return {
    displayText: zhPart || fallback,
    ttsText: jaPart || zhPart || fallback,
    hasJa: !!jaPart,
  };
}
