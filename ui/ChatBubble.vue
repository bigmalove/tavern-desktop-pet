<template>
  <div
    v-if="visible"
    class="chat-bubble"
    :style="bubbleStyle"
  >
    <div class="bubble-content">
      <button
        v-if="isDone"
        type="button"
        class="bubble-close"
        aria-label="关闭聊天气泡"
        @click="closeBubble"
      >
        ×
      </button>
      <span class="bubble-text">{{ displayText }}</span>
      <span
        v-if="!isDone"
        class="cursor"
      >|</span>
    </div>
    <div class="bubble-arrow"></div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { Live2DManager } from '../live2d/manager';

const props = defineProps<{
  text: string;
  isDone: boolean;
  autoCloseDelaySeconds?: number;
}>();

const emit = defineEmits<{
  hidden: [];
}>();

const visible = ref(false);
const displayText = ref('');
const bubbleStyle = ref<Record<string, string>>({});

const HEAD_ANCHOR_RATIO = 0.2;
const BUBBLE_GAP = 12;
const MIN_BUBBLE_TOP = 8;
const EDGE_PADDING = 8;
const LOADING_FRAMES = ['。。。', '。。', '。', '。。'] as const;
const LOADING_INTERVAL_MS = 340;

let positionTimer: ReturnType<typeof setInterval> | null = null;
let loadingTimer: ReturnType<typeof setInterval> | null = null;
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null;
let loadingFrameIndex = 0;

function getTopWindow(): Window {
  try {
    return window.parent ?? window;
  } catch {
    return window;
  }
}

function getFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function getModelHeadAnchor(rect: DOMRect): { x: number; y: number } | null {
  const model = Live2DManager.model as any;
  if (!model || typeof model.getBounds !== 'function') return null;

  try {
    const bounds = model.getBounds?.();
    const x = getFiniteNumber(bounds?.x);
    const y = getFiniteNumber(bounds?.y);
    const width = getFiniteNumber(bounds?.width);
    const height = getFiniteNumber(bounds?.height);
    if (x === null || y === null || width === null || height === null || width <= 0 || height <= 0) {
      return null;
    }

    return {
      x: rect.left + x + width / 2,
      y: rect.top + y + height * HEAD_ANCHOR_RATIO,
    };
  } catch {
    return null;
  }
}

function updateBubblePosition(): void {
  try {
    const top = getTopWindow();
    const stage = top.document.getElementById('desktop-pet-stage') as HTMLElement | null;
    const rect = stage?.getBoundingClientRect?.();
    const vw = top.innerWidth || top.document.documentElement.clientWidth || 0;
    const vh = top.innerHeight || top.document.documentElement.clientHeight || 0;

    if (rect && rect.width > 0 && rect.height > 0) {
      const anchor = getModelHeadAnchor(rect);
      const fallbackX = rect.left + rect.width / 2;
      const fallbackY = rect.top + rect.height * 0.22;
      const rawLeft = anchor?.x ?? fallbackX;
      const rawTop = (anchor?.y ?? fallbackY) - BUBBLE_GAP;
      const safeLeft = Math.max(EDGE_PADDING, Math.min(rawLeft, Math.max(EDGE_PADDING, vw - EDGE_PADDING)));
      const safeTop = Math.max(MIN_BUBBLE_TOP, Math.min(rawTop, Math.max(MIN_BUBBLE_TOP, vh - EDGE_PADDING)));

      bubbleStyle.value = {
        left: `${Math.round(safeLeft)}px`,
        top: `${Math.round(safeTop)}px`,
      };
      return;
    }

    bubbleStyle.value = {
      left: `${Math.round(vw * 0.5)}px`,
      top: `${Math.round(Math.max(8, vh * 0.2))}px`,
    };
  } catch {
    bubbleStyle.value = {
      left: '50vw',
      top: '20vh',
    };
  }
}

function startPositionSync(): void {
  stopPositionSync();
  updateBubblePosition();
  positionTimer = setInterval(updateBubblePosition, 100);
}

function stopPositionSync(): void {
  if (!positionTimer) return;
  clearInterval(positionTimer);
  positionTimer = null;
}

function startLoadingAnimation(): void {
  if (loadingTimer) return;
  loadingFrameIndex = 0;
  displayText.value = LOADING_FRAMES[loadingFrameIndex];
  loadingTimer = setInterval(() => {
    loadingFrameIndex = (loadingFrameIndex + 1) % LOADING_FRAMES.length;
    displayText.value = LOADING_FRAMES[loadingFrameIndex];
  }, LOADING_INTERVAL_MS);
}

function stopLoadingAnimation(): void {
  if (!loadingTimer) return;
  clearInterval(loadingTimer);
  loadingTimer = null;
}

function stopAutoCloseTimer(): void {
  if (!autoCloseTimer) return;
  clearTimeout(autoCloseTimer);
  autoCloseTimer = null;
}

function getAutoCloseDelayMs(): number {
  const delaySeconds =
    typeof props.autoCloseDelaySeconds === 'number'
      ? props.autoCloseDelaySeconds
      : Number(props.autoCloseDelaySeconds ?? Number.NaN);
  if (!Number.isFinite(delaySeconds)) return -1;

  const normalizedSeconds = Math.round(delaySeconds);
  if (normalizedSeconds < 0) return normalizedSeconds;
  return normalizedSeconds * 1000;
}

function scheduleAutoClose(): void {
  stopAutoCloseTimer();
  if (!props.isDone) return;
  if (!String(props.text || '').trim()) return;

  const delayMs = getAutoCloseDelayMs();
  if (delayMs < 0) return;

  autoCloseTimer = setTimeout(() => {
    autoCloseTimer = null;
    closeBubble();
  }, delayMs);
}

function syncBubbleState(): void {
  const text = String(props.text || '');

  if (text) {
    visible.value = true;
    displayText.value = text;
    stopLoadingAnimation();
    startPositionSync();
    scheduleAutoClose();
    return;
  }

  if (!props.isDone) {
    visible.value = true;
    startLoadingAnimation();
    startPositionSync();
    stopAutoCloseTimer();
    return;
  }

  visible.value = false;
  displayText.value = '';
  stopLoadingAnimation();
  stopPositionSync();
  stopAutoCloseTimer();
}

watch([() => props.text, () => props.isDone, () => props.autoCloseDelaySeconds], syncBubbleState, {
  immediate: true,
});

function closeBubble(): void {
  visible.value = false;
  displayText.value = '';
  stopLoadingAnimation();
  stopPositionSync();
  stopAutoCloseTimer();
  emit('hidden');
}

onUnmounted(() => {
  stopLoadingAnimation();
  stopPositionSync();
  stopAutoCloseTimer();
});
</script>

<style lang="scss" scoped>
@use './styles/theme-arknights.scss' as theme;

.chat-bubble {
  position: fixed;
  transform: translate(-50%, -100%);
  max-width: 320px;
  min-width: 80px;
  animation: bubble-in 0.22s ease-out;
  z-index: 10004;
  pointer-events: none;
}

.bubble-content {
  position: relative;
  background: rgba(14, 14, 14, 0.96);
  color: theme.$ark-text-main;
  border: 1px solid theme.$ark-accent-yellow;
  padding: 9px 26px 10px 13px;
  clip-path: polygon(
    10px 0,
    100% 0,
    100% calc(100% - 10px),
    calc(100% - 10px) 100%,
    0 100%,
    0 10px
  );
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
  box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.56);
  font-family: theme.$font-cn;
  pointer-events: auto;

  &::after {
    content: '';
    position: absolute;
    right: 22px;
    bottom: -2px;
    width: 30px;
    height: 3px;
    background: theme.$ark-accent-yellow;
  }
}

.bubble-text {
  white-space: pre-wrap;
}

.cursor {
  animation: blink 0.64s infinite;
  margin-left: 1px;
  color: theme.$ark-accent-cyan;
}

.bubble-close {
  position: absolute;
  right: 6px;
  top: 5px;
  width: 15px;
  height: 15px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  line-height: 13px;
  text-align: center;
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  font-family: theme.$font-en;

  &:hover {
    background: theme.$ark-danger;
    border-color: theme.$ark-danger;
  }
}

.bubble-arrow {
  width: 11px;
  height: 11px;
  background: rgba(14, 14, 14, 0.96);
  border-left: 1px solid theme.$ark-accent-yellow;
  border-bottom: 1px solid theme.$ark-accent-yellow;
  transform: rotate(-45deg);
  margin: 0 auto;
  margin-top: -6px;
}

@keyframes bubble-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(8px) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

@keyframes blink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
}
</style>
