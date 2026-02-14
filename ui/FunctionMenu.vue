<template>
  <div v-if="visible" class="menu-overlay" @click.self="close">
    <div
      ref="menuEl"
      class="menu-cluster"
      :class="[`is-${placement}`, { 'chat-open': chatOpen }]"
      :style="panelStyle"
      @click.stop
    >
      <div class="menu-panel">
        <div class="panel-top">
          <span class="panel-title">TACTICAL</span>
          <button class="icon-btn" type="button" @click="close">×</button>
        </div>

        <button class="command-btn" type="button" :class="{ active: chatOpen }" @click="openChat">
          <span class="command-index">01</span>
          <span class="command-main">CHAT</span>
          <span class="command-sub">MESSAGE LINK</span>
        </button>

        <button class="command-btn" type="button" @click="$emit('toggle-motion-loop')">
          <span class="command-index">02</span>
          <span class="command-main">MOTION</span>
          <span class="command-sub">{{ motionLoopEnabled ? 'ON' : 'OFF' }}</span>
        </button>

        <button class="command-btn" type="button" @click="$emit('switch-model')">
          <span class="command-index">03</span>
          <span class="command-main">MODEL</span>
          <span class="command-sub">SWITCH</span>
        </button>

        <button class="command-btn" type="button" @click="$emit('switch-persona')">
          <span class="command-index">04</span>
          <span class="command-main">PERSONA</span>
          <span class="command-sub">{{ commentStyle }}</span>
        </button>

        <button class="command-btn danger" type="button" @click="$emit('close-model')">
          <span class="command-index">05</span>
          <span class="command-main">CLOSE</span>
          <span class="command-sub">MODEL OFF</span>
        </button>
      </div>

      <transition name="drawer">
        <div v-if="chatOpen" class="chat-drawer">
          <div class="drawer-head">
            <span class="drawer-title">MESSAGE LINK</span>
            <button class="drawer-close" type="button" @click="chatOpen = false">×</button>
          </div>

          <textarea
            ref="inputEl"
            v-model="input"
            class="chat-input"
            rows="4"
            placeholder="输入内容... (Enter 发送 / Shift+Enter 换行)"
            @keydown="onInputKeydown"
          />

          <div class="drawer-actions">
            <button class="send-btn" type="button" :disabled="!input.trim()" @click="send">
              SEND
            </button>
          </div>
          <div class="drawer-hint">系统会读取最近聊天上下文。</div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import type { CommentStyle } from '../core/constants';

const props = defineProps<{
  visible: boolean;
  x: number;
  y: number;
  placement: 'left' | 'right';
  motionLoopEnabled: boolean;
  commentStyle: CommentStyle;
}>();

const emit = defineEmits<{
  close: [];
  'send-chat': [message: string];
  'toggle-motion-loop': [];
  'switch-model': [];
  'switch-persona': [];
  'close-model': [];
}>();

const menuEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLTextAreaElement | null>(null);
const input = ref('');
const chatOpen = ref(false);

const posX = ref(0);
const posY = ref(0);

function getTopWindow(): Window {
  try {
    return window.parent ?? window;
  } catch {
    return window;
  }
}

const panelTransform = computed(() => (props.placement === 'left'
  ? 'translate(-100%, -50%)'
  : 'translate(0, -50%)'));

const panelStyle = computed(() => ({
  left: `${posX.value}px`,
  top: `${posY.value}px`,
  transform: panelTransform.value,
}));

function clampIntoViewport(): void {
  const el = menuEl.value;
  if (!el) return;

  const top = getTopWindow();
  const vw = top.innerWidth || top.document.documentElement.clientWidth || 0;
  const vh = top.innerHeight || top.document.documentElement.clientHeight || 0;
  const margin = 8;

  const rect = el.getBoundingClientRect();

  if (vw > 0) {
    if (rect.left < margin) {
      posX.value += margin - rect.left;
    } else if (rect.right > vw - margin) {
      posX.value -= rect.right - (vw - margin);
    }
  }

  if (vh > 0) {
    if (rect.top < margin) {
      posY.value += margin - rect.top;
    } else if (rect.bottom > vh - margin) {
      posY.value -= rect.bottom - (vh - margin);
    }
  }
}

function close(): void {
  chatOpen.value = false;
  emit('close');
}

function send(): void {
  const message = input.value.trim();
  if (!message) return;
  emit('send-chat', message);
  input.value = '';
}

function openChat(): void {
  chatOpen.value = true;
  void nextTick(() => {
    clampIntoViewport();
    inputEl.value?.focus();
    inputEl.value?.select();
  });
}

function onInputKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
}

const onGlobalKeydown = (e: KeyboardEvent) => {
  if (!props.visible) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
};

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      chatOpen.value = false;
      return;
    }
    posX.value = Number.isFinite(props.x) ? props.x : 0;
    posY.value = Number.isFinite(props.y) ? props.y : 0;
    chatOpen.value = false;
    await nextTick();
    clampIntoViewport();
  },
  { immediate: true },
);

watch(
  () => [props.x, props.y, props.placement, chatOpen.value] as const,
  async () => {
    if (!props.visible) return;
    posX.value = Number.isFinite(props.x) ? props.x : 0;
    posY.value = Number.isFinite(props.y) ? props.y : 0;
    await nextTick();
    clampIntoViewport();
  },
);

try {
  getTopWindow().addEventListener('keydown', onGlobalKeydown);
} catch {
  // ignore
}

onUnmounted(() => {
  try {
    getTopWindow().removeEventListener('keydown', onGlobalKeydown);
  } catch {
    // ignore
  }
});
</script>

<style lang="scss" scoped>
@use './styles/theme-arknights.scss' as theme;

.menu-overlay {
  @include theme.overlay-backdrop(10002, 0.12);
}

.menu-cluster {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: calc(100vw - 16px);
  pointer-events: auto;

  &.is-left {
    flex-direction: row-reverse;
  }
}

.menu-panel {
  width: 164px;
  padding: 8px;
  background: theme.$ark-base;
  color: theme.$ark-text-main;
  font-family: theme.$font-cn;
  @include theme.tech-panel(theme.$ark-accent-yellow);
  @include theme.tech-grid(20px, 0.03);
}

.panel-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  padding: 4px 4px 8px;
  border-bottom: 1px solid rgba(255, 225, 0, 0.35);
}

.panel-title {
  font-family: theme.$font-en;
  color: theme.$ark-accent-yellow;
  font-size: 12px;
  letter-spacing: 0.12em;
}

.icon-btn {
  @include theme.ark-button-base;
  width: 28px;
  height: 24px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

.command-btn {
  @include theme.ark-button-base;
  width: 100%;
  min-height: 52px;
  padding: 8px 10px;
  margin-bottom: 8px;
  text-align: left;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'idx main'
    'idx sub';
  column-gap: 8px;
  row-gap: 2px;

  &:last-child {
    margin-bottom: 0;
  }

  &.active {
    background: theme.$ark-accent-yellow;
    color: #000;
    border-color: theme.$ark-accent-yellow;
  }

  &.danger {
    border-color: rgba(255, 59, 48, 0.45);
    color: #ffc9c5;

    &:hover {
      background: theme.$ark-danger;
      border-color: theme.$ark-danger;
      color: #fff;
    }
  }
}

.command-index {
  grid-area: idx;
  align-self: center;
  font-family: theme.$font-en;
  font-size: 16px;
  color: theme.$ark-accent-cyan;
}

.command-main {
  grid-area: main;
  font-family: theme.$font-en;
  font-size: 12px;
  line-height: 1;
}

.command-sub {
  grid-area: sub;
  font-size: 10px;
  color: theme.$ark-text-sub;
  text-transform: none;
}

.chat-drawer {
  width: min(320px, calc(100vw - 36px));
  max-height: min(68vh, 420px);
  padding: 12px;
  background: theme.$ark-surface;
  color: theme.$ark-text-main;
  overflow: auto;
  @include theme.tech-panel(theme.$ark-accent-cyan);
  @include theme.tech-grid(20px, 0.024);
  @include theme.ark-scrollbar;
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 218, 194, 0.38);
}

.drawer-title {
  font-family: theme.$font-en;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: theme.$ark-accent-cyan;
}

.drawer-close {
  @include theme.ark-button-base;
  width: 26px;
  height: 24px;
  padding: 0;
  font-size: 16px;
  line-height: 1;
}

.chat-input {
  @include theme.ark-input-base;
  min-height: 96px;
  resize: vertical;
  color: #fff;
}

.drawer-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.send-btn {
  @include theme.ark-button-base;
  min-width: 96px;
  height: 34px;
}

.drawer-hint {
  margin-top: 8px;
  font-size: 11px;
  color: theme.$ark-text-sub;
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

.menu-cluster.is-left {
  .drawer-enter-from,
  .drawer-leave-to {
    transform: translateX(8px);
  }
}
</style>

