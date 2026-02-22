<template>
  <div>
    <ChatBubble
      :text="bubbleText"
      :is-done="bubbleDone"
      :auto-close-delay-seconds="settings.bubbleDuration"
      @hidden="onBubbleHidden"
    />
    <SettingsPanel
      :visible="showSettings"
      @close="uiStore.closeSettings()"
      @model-change="onModelChange"
    />

    <FunctionMenu
      :visible="showMenu"
      :x="menuAnchor.x"
      :y="menuAnchor.y"
      :placement="menuPlacement"
      :motion-loop-enabled="settings.autoMotionLoop"
      :comment-style="settings.commentStyle"
      @close="showMenu = false"
      @send-chat="onManualChat"
      @toggle-motion-loop="toggleMotionLoop"
      @switch-model="openModelBrowser"
      @switch-persona="cyclePersona"
      @close-model="closePet"
    />

    <div v-if="showModelBrowser" class="browser-overlay" @click.self="showModelBrowser = false">
      <div class="browser-dialog">
        <div class="browser-dialog-header">
          <h3>在线模型库</h3>
          <button class="close-btn" @click="showModelBrowser = false">×</button>
        </div>
        <div class="browser-dialog-body">
          <ModelBrowser
            :use-cdn="settings.useCdn"
            @cancel="showModelBrowser = false"
            @load-model="onModelBrowserLoad"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { getTTSEnabled } from '../audio/tts-config';
import { TTSManager } from '../audio/tts-manager';
import { splitZhJaForDisplayAndTts } from '../chat/bilingual-text';
import { Commentator } from '../chat/commentator';
import { parseEmotionCotText } from '../chat/emotion-cot';
import { ChatMonitor } from '../chat/monitor';
import { DEFAULTS, LOCAL_LIVE2D_MODEL_PATH_PREFIX, type EmotionTag } from '../core/constants';
import { getEmotionConfigByTag } from '../core/emotion';
import { useSettingsStore } from '../core/settings';
import { useUiStore } from '../core/ui';
import { hasLive2DModel } from '../db/live2d-models';
import { Live2DManager, type ModelLoadProgress } from '../live2d/manager';
import { matchLive2DExpression, matchLive2DMotion } from '../live2d/expression-motion';
import { LipSyncManager, setLipSyncRefs } from '../live2d/lip-sync';
import { Live2DStage } from '../live2d/stage';
import type { GestureEvent } from '../utils/gesture-recognizer';
import { error as logError, log } from '../utils/dom';
import ChatBubble from './ChatBubble.vue';
import FunctionMenu from './FunctionMenu.vue';
import ModelBrowser from './ModelBrowser.vue';
import SettingsPanel from './SettingsPanel.vue';

const store = useSettingsStore();
const { settings } = storeToRefs(store);
const uiStore = useUiStore();
const { showSettings } = storeToRefs(uiStore);

const bubbleText = ref('');
const bubbleDone = ref(true);
const BASE_STAGE_WIDTH = 280;
const BASE_STAGE_HEIGHT = 360;
const OPEN_SETTINGS_FN_KEY = '__desktopPetOpenSettings_v2';
let globalOpenSettingsFn: (() => void) | null = null;

let modelLoadTaskId = 0;
let initTaskId = 0;
let modelLoadingHideTimer: number | null = null;
let statusCheckTimer: number | null = null;
let viewportResizeSyncTimer: number | null = null;
let boundWindowResizeHandler: (() => void) | null = null;
let boundVisualViewportResizeHandler: (() => void) | null = null;
let gazeFollowBound = false;
let gazePointerMoveHandler: ((event: PointerEvent) => void) | null = null;
let gazePointerDownHandler: ((event: PointerEvent) => void) | null = null;
let gazeFollowRafId: number | null = null;
let gazePendingPoint: { x: number; y: number } | null = null;
let petClosed = false;

const showMenu = ref(false);
const menuAnchor = ref({ x: 0, y: 0 });
const menuPlacement = ref<'left' | 'right'>('left');
const showModelBrowser = ref(false);

type PhoneChatMessage = {
  id?: string;
  sender?: string;
  type?: string;
  content?: string;
  replyContent?: string;
  description?: string;
  filename?: string;
  amount?: number | string;
  message?: string;
  membershipType?: string;
  months?: number | string;
  time?: number | string;
  [key: string]: unknown;
};

type PhoneEventDetail = {
  contactId?: string;
  message?: PhoneChatMessage;
};

type PhoneTTSSource = 'acsus' | 'baibai';
type PhoneTTSQueueItem = { source: PhoneTTSSource; contactId: string; message: PhoneChatMessage };
type StopHandle = { stop: () => void };
type AssistantChatMessage = {
  message_id?: number | string;
  message?: string;
  role?: string;
  [key: string]: unknown;
};

const PHONE_TTS_SEEN_MAX = 4000;
const BAIBAI_ASSISTANT_SEEN_MAX = 2000;
let phoneTtsBridgeBound = false;
let phoneMessageReceivedHandler: ((event: Event) => void) | null = null;
let phoneAIGenCompleteHandler: ((event: Event) => void) | null = null;
let phoneTtsListenSinceSec = 0;
const phoneSeenMessageKeys = new Set<string>();
const phoneSeenMessageOrder: string[] = [];
const phoneTtsQueue: PhoneTTSQueueItem[] = [];
let phoneTtsQueueRunning = false;
let baibaiPhoneTtsBridgeBound = false;
let baibaiPhonePollTimer: number | null = null;
const baibaiEventStops: StopHandle[] = [];
const baibaiSeenAssistantIds = new Set<number>();
const baibaiSeenAssistantOrder: number[] = [];

function getTopWindow(): Window {
  try {
    return window.parent ?? window;
  } catch {
    return window;
  }
}

function getCurrentCharacterId(): string {
  try {
    const ctx = (SillyTavern as any)?.getContext?.();
    if (ctx?.characterId !== undefined && ctx?.characterId !== null) {
      return String(ctx.characterId);
    }
  } catch {
    // ignore
  }
  return 'default';
}

function getPhoneStore(): any {
  try {
    const topAny: any = getTopWindow() as any;
    const store = topAny?.extension_settings?.acsusPawsPuffs?.phone;
    if (store && typeof store === 'object') return store;
  } catch {
    // ignore
  }

  try {
    const localAny: any = window as any;
    const store = localAny?.extension_settings?.acsusPawsPuffs?.phone;
    if (store && typeof store === 'object') return store;
  } catch {
    // ignore
  }

  return null;
}

function getPhoneContactName(source: PhoneTTSSource, contactId: string): string {
  const safeId = String(contactId || '').trim();
  const fallback = safeId.replace(/^chat_/, '').replace(/^tavern_/, '').trim() || '联系人';
  if (source === 'baibai') return fallback;

  const store = getPhoneStore();
  const contacts = Array.isArray(store?.contacts) ? store.contacts : [];
  const matched = contacts.find((item: any) => String(item?.id || '').trim() === safeId);
  const name = String(matched?.name || '').trim();
  return name || fallback;
}

function getPhoneChatHistory(contactId: string): PhoneChatMessage[] {
  const store = getPhoneStore();
  const key = `chat_${String(contactId || '').trim()}`;
  const history = store?.chats?.[key];
  return Array.isArray(history) ? (history as PhoneChatMessage[]) : [];
}

function isNonUserPhoneMessage(message: PhoneChatMessage | null | undefined): boolean {
  const sender = String(message?.sender || '')
    .trim()
    .toLowerCase();
  const type = String(message?.type || 'text')
    .trim()
    .toLowerCase();
  return sender === 'contact' && type === 'text';
}

function sanitizePhoneSpeakText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPhoneAutoReadEnabled(source: PhoneTTSSource): boolean {
  if (source === 'baibai') {
    return settings.value.baibaiPhoneMessageAutoRead === true;
  }
  return settings.value.phoneMessageAutoRead !== false;
}

function getNormalizedUserNames(): Set<string> {
  const names = new Set<string>();
  const append = (value: unknown) => {
    const normalized = sanitizePhoneSpeakText(value).toLowerCase();
    if (normalized) names.add(normalized);
  };

  try {
    append((SillyTavern as any)?.name1);
  } catch {
    // ignore
  }

  try {
    const ctx = (SillyTavern as any)?.getContext?.();
    append(ctx?.name1);
    append(ctx?.userName);
  } catch {
    // ignore
  }

  append('user');
  return names;
}

function isBaibaiUserSender(senderName: unknown): boolean {
  const sender = sanitizePhoneSpeakText(senderName).toLowerCase();
  if (!sender) return false;
  return getNormalizedUserNames().has(sender);
}

function sanitizeAssistantPhoneCommandText(value: unknown): string {
  return String(value ?? '')
    .replace(/<think[ing]*?>[\s\S]*?<\/think[ing]*?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
}

function hasBaibaiPhoneCommand(value: unknown): boolean {
  return /\bqq\.(?:private|group)\s*\(/i.test(String(value ?? ''));
}

function parseBaibaiCommandArgs(rawArgs: string): string[] {
  const source = String(rawArgs || '').trim();
  if (!source) return [];

  const quotedArgs: string[] = [];
  const quotedMatcher = /'([^']*)'|"([^"]*)"/g;
  for (const match of source.matchAll(quotedMatcher)) {
    const value = sanitizePhoneSpeakText(match[1] ?? match[2] ?? '');
    quotedArgs.push(value);
  }
  if (quotedArgs.length > 0) return quotedArgs;

  return source
    .split(',')
    .map((item) => sanitizePhoneSpeakText(item))
    .filter((item) => !!item);
}

function extractBaibaiTextPayloads(rawPayload: unknown): string[] {
  const payload = String(rawPayload ?? '');
  if (!payload) return [];

  const marker = payload.match(/\[(.+?)-(.+?)\]/);
  if (!marker) {
    const text = sanitizePhoneSpeakText(payload);
    return text ? [text] : [];
  }

  const markerType = sanitizePhoneSpeakText(marker[1]).toLowerCase();
  if (markerType === 'bqb' || markerType === 'img') {
    const text = sanitizePhoneSpeakText(payload.replace(marker[0], ''));
    return text ? [text] : [];
  }

  return [];
}

function extractPhoneSpeakText(message: PhoneChatMessage): string {
  const type = String(message?.type || 'text')
    .trim()
    .toLowerCase();

  switch (type) {
    case 'text': {
      let text = sanitizePhoneSpeakText(message.content);
      text = text.replace(/^\[约定计划(?:已完成|过程|内心印象|过程记录)?\]/, '').trim();
      return text;
    }
    case 'quote':
      return sanitizePhoneSpeakText(message.replyContent || message.content || '引用消息');
    case 'emoji':
      return sanitizePhoneSpeakText(`表情 ${message.content || '消息'}`);
    case 'image':
    case 'image-real':
    case 'image-fake': {
      const desc = sanitizePhoneSpeakText(message.description || message.content || '');
      return desc ? `图片，${desc}` : '图片消息';
    }
    case 'redpacket':
      return `红包 ${sanitizePhoneSpeakText(message.amount || 0)} 元`;
    case 'transfer': {
      const amount = sanitizePhoneSpeakText(message.amount || 0);
      const note = sanitizePhoneSpeakText(message.message || message.content || '');
      return note ? `转账 ${amount} 元，留言 ${note}` : `转账 ${amount} 元`;
    }
    case 'video':
      return sanitizePhoneSpeakText(`视频 ${message.description || ''}`) || '视频消息';
    case 'file':
      return sanitizePhoneSpeakText(`文件 ${message.filename || ''}`) || '文件消息';
    case 'poke':
      return '戳了戳你';
    case 'recalled':
    case 'recalled-pending':
      return '撤回了一条消息';
    case 'friend_request':
    case 'friend_added':
    case 'friend_deleted':
      return sanitizePhoneSpeakText(message.content || '');
    case 'gift-membership':
    case 'buy-membership': {
      const months = sanitizePhoneSpeakText(message.months || '');
      const memberType = String(message.membershipType || '').toUpperCase() || '会员';
      return sanitizePhoneSpeakText(`赠送${months ? `${months}个月` : ''}${memberType}`);
    }
    default:
      return sanitizePhoneSpeakText(message.content || message.description || '');
  }
}

function getPhoneMessageKey(source: PhoneTTSSource, contactId: string, message: PhoneChatMessage): string {
  const safeContact = String(contactId || '').trim();
  const messageId = sanitizePhoneSpeakText(message?.id);
  if (messageId) return `${source}:${safeContact}:${messageId}`;

  const sender = sanitizePhoneSpeakText(message?.sender).toLowerCase() || 'unknown';
  const type = sanitizePhoneSpeakText(message?.type).toLowerCase() || 'text';
  const time = Number(message?.time || 0);
  const content = sanitizePhoneSpeakText(
    message?.content || message?.replyContent || message?.description || message?.filename || '',
  ).slice(0, 72);

  return `${source}:${safeContact}:${sender}:${type}:${time}:${content}`;
}

function rememberPhoneMessageKey(key: string): void {
  if (!key || phoneSeenMessageKeys.has(key)) return;
  phoneSeenMessageKeys.add(key);
  phoneSeenMessageOrder.push(key);
  if (phoneSeenMessageOrder.length <= PHONE_TTS_SEEN_MAX) return;
  const stale = phoneSeenMessageOrder.shift();
  if (stale) {
    phoneSeenMessageKeys.delete(stale);
  }
}

function markExistingPhoneMessagesAsSeen(): void {
  const store = getPhoneStore();
  const chats = store?.chats;
  if (!chats || typeof chats !== 'object') return;

  for (const [chatKey, list] of Object.entries(chats as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    const contactId = String(chatKey || '')
      .replace(/^chat_/, '')
      .trim();
    if (!contactId) continue;

    for (const raw of list) {
      const message = raw as PhoneChatMessage;
      if (!isNonUserPhoneMessage(message)) continue;
      rememberPhoneMessageKey(getPhoneMessageKey('acsus', contactId, message));
    }
  }
}

function resolveTavernEventName(eventKey: string): string | null {
  try {
    const top = getTopWindow() as any;
    const fromTop = top?.SillyTavern?.eventTypes?.[eventKey];
    if (fromTop) return String(fromTop);
  } catch {
    // ignore
  }

  try {
    const fromLegacy = (tavern_events as any)?.[eventKey];
    if (fromLegacy) return String(fromLegacy);
  } catch {
    // ignore
  }

  return null;
}

function bindTavernEvent(eventKey: string, handler: (...args: any[]) => void): StopHandle | null {
  const eventName = resolveTavernEventName(eventKey);
  if (!eventName) return null;

  try {
    const top = getTopWindow() as any;
    const eventSource = top?.SillyTavern?.eventSource;
    if (eventSource && typeof eventSource.on === 'function') {
      eventSource.on(eventName, handler);
      return {
        stop: () => {
          try {
            if (typeof eventSource.off === 'function') {
              eventSource.off(eventName, handler);
            } else if (typeof eventSource.removeListener === 'function') {
              eventSource.removeListener(eventName, handler);
            }
          } catch {
            // ignore
          }
        },
      };
    }
  } catch {
    // ignore
  }

  if (typeof eventOn === 'function') {
    return eventOn(eventName as any, handler);
  }
  return null;
}

function resetBaibaiAssistantSeenState(): void {
  baibaiSeenAssistantIds.clear();
  baibaiSeenAssistantOrder.length = 0;
}

function rememberBaibaiAssistantMessageId(messageId: number): void {
  if (!Number.isFinite(messageId)) return;
  if (baibaiSeenAssistantIds.has(messageId)) return;
  baibaiSeenAssistantIds.add(messageId);
  baibaiSeenAssistantOrder.push(messageId);
  if (baibaiSeenAssistantOrder.length <= BAIBAI_ASSISTANT_SEEN_MAX) return;
  const stale = baibaiSeenAssistantOrder.shift();
  if (typeof stale === 'number') {
    baibaiSeenAssistantIds.delete(stale);
  }
}

function getAssistantChatMessages(): AssistantChatMessage[] {
  try {
    const messages = getChatMessages(`0-{{lastMessageId}}`, {
      role: 'assistant',
      hide_state: 'unhidden',
    });
    return Array.isArray(messages) ? (messages as AssistantChatMessage[]) : [];
  } catch {
    return [];
  }
}

function parseBaibaiPhoneMessagesFromAssistant(
  message: AssistantChatMessage,
): Array<{ contactId: string; message: PhoneChatMessage }> {
  const normalizedText = sanitizeAssistantPhoneCommandText(message?.message);
  if (!normalizedText || !hasBaibaiPhoneCommand(normalizedText)) return [];

  const assistantMessageId = Number(message?.message_id);
  const parsed: Array<{ contactId: string; message: PhoneChatMessage }> = [];
  const commandMatches = normalizedText.matchAll(/([a-zA-Z]+\.[a-zA-Z]+)\(([\s\S]*?)\);/g);
  let commandIndex = 0;

  for (const match of commandMatches) {
    commandIndex++;
    const commandName = String(match[1] || '')
      .trim()
      .toLowerCase();
    if (commandName !== 'qq.private' && commandName !== 'qq.group') continue;

    const args = parseBaibaiCommandArgs(String(match[2] || ''));
    if (args.length < 4) continue;

    const contactId = sanitizePhoneSpeakText(args[0]) || '柏柏会话';
    const senderName = sanitizePhoneSpeakText(args[1]);
    if (!senderName || isBaibaiUserSender(senderName)) continue;

    const textPayloads = extractBaibaiTextPayloads(args[2]);
    if (textPayloads.length === 0) continue;

    const rawTime = sanitizePhoneSpeakText(args[3]);
    const messageIdPart = Number.isFinite(assistantMessageId) ? String(assistantMessageId) : 'unknown';

    textPayloads.forEach((text, index) => {
      const speakText = sanitizePhoneSpeakText(text);
      if (!speakText) return;

      parsed.push({
        contactId,
        message: {
          id: `baibai_${messageIdPart}_${commandIndex}_${index}`,
          sender: 'contact',
          type: 'text',
          content: speakText,
          time: rawTime || messageIdPart,
        },
      });
    });
  }

  return parsed;
}

function markExistingBaibaiMessagesAsSeen(): void {
  const messages = getAssistantChatMessages();
  for (const item of messages) {
    const messageId = Number(item?.message_id);
    if (!Number.isFinite(messageId) || messageId < 0) continue;
    rememberBaibaiAssistantMessageId(messageId);
  }
}

function collectUnsyncedBaibaiMessages(): void {
  const messages = getAssistantChatMessages();
  if (messages.length === 0) return;

  for (const item of messages) {
    const messageId = Number(item?.message_id);
    if (!Number.isFinite(messageId) || messageId < 0) continue;
    if (baibaiSeenAssistantIds.has(messageId)) continue;

    rememberBaibaiAssistantMessageId(messageId);

    const parsedMessages = parseBaibaiPhoneMessagesFromAssistant(item);
    for (const parsed of parsedMessages) {
      enqueuePhoneMessageForTTS(parsed.contactId, parsed.message, 'baibai');
    }
  }
}

async function waitForTTSIdle(timeoutMs = 45000): Promise<void> {
  const startAt = Date.now();
  while (TTSManager.isLoading || TTSManager.isPlaying) {
    if (Date.now() - startAt > timeoutMs) {
      TTSManager.stop();
      return;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 120);
    });
  }
}

async function drainPhoneTTSQueue(): Promise<void> {
  if (phoneTtsQueueRunning) return;
  phoneTtsQueueRunning = true;

  try {
    while (phoneTtsQueue.length > 0) {
      const next = phoneTtsQueue.shift();
      if (!next) continue;

      const ttsEnabled = getTTSEnabled();
      const autoPlay = !!settings.value.ttsAutoPlay;
      const phoneAutoRead = isPhoneAutoReadEnabled(next.source);
      if (!ttsEnabled || !autoPlay || !phoneAutoRead) continue;

      const speakText = extractPhoneSpeakText(next.message);
      if (!speakText) continue;

      const contactName = getPhoneContactName(next.source, next.contactId);
      const speaker = getCurrentCharacterId();
      const voiceName = String(settings.value.ttsDefaultSpeaker || '').trim();
      const ttsOverrides: { speaker?: string; context?: string } = {};
      if (voiceName) ttsOverrides.speaker = voiceName;
      const contextPrefix = next.source === 'baibai' ? '柏柏小手机' : '毛球点心铺手机';
      ttsOverrides.context = `${contextPrefix}·${contactName}`;

      await waitForTTSIdle(45000);

      await TTSManager.speak(
        {
          type: 'dialogue',
          speaker,
          text: speakText,
          tts: ttsOverrides,
        },
        `desktop_pet_phone_${next.source}_${next.contactId}_${Date.now()}`,
      );
    }
  } catch (e) {
    logError('手机消息自动朗读失败', e);
  } finally {
    phoneTtsQueueRunning = false;
  }
}

function enqueuePhoneMessageForTTS(
  contactId: string,
  message: PhoneChatMessage | null | undefined,
  source: PhoneTTSSource = 'acsus',
): void {
  if (!message) return;
  if (!isNonUserPhoneMessage(message)) return;

  const key = getPhoneMessageKey(source, contactId, message);
  if (phoneSeenMessageKeys.has(key)) return;
  rememberPhoneMessageKey(key);

  const messageSec = Number(message.time || 0);
  if (
    source === 'acsus' &&
    Number.isFinite(messageSec) &&
    messageSec > 0 &&
    phoneTtsListenSinceSec > 0 &&
    messageSec + 2 < phoneTtsListenSinceSec
  ) {
    return;
  }

  if (!isPhoneAutoReadEnabled(source)) {
    return;
  }

  phoneTtsQueue.push({ source, contactId, message });
  void drainPhoneTTSQueue();
}

function collectUnsyncedPhoneMessages(contactId: string): void {
  const history = getPhoneChatHistory(contactId);
  if (history.length === 0) return;

  const pending: PhoneChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (!isNonUserPhoneMessage(message)) continue;

    const key = getPhoneMessageKey('acsus', contactId, message);
    if (phoneSeenMessageKeys.has(key)) {
      break;
    }
    pending.push(message);
  }

  pending.reverse().forEach((message) => {
    enqueuePhoneMessageForTTS(contactId, message);
  });
}

function bindPhoneTTSBridge(): void {
  if (phoneTtsBridgeBound) return;

  phoneTtsListenSinceSec = Math.floor(Date.now() / 1000);
  markExistingPhoneMessagesAsSeen();

  const top = getTopWindow();
  const topDoc = top.document ?? document;

  phoneMessageReceivedHandler = (event: Event) => {
    const detail = (event as CustomEvent<PhoneEventDetail>).detail || {};
    const contactId = String(detail.contactId || '').trim();
    if (!contactId) return;
    enqueuePhoneMessageForTTS(contactId, detail.message);
  };

  phoneAIGenCompleteHandler = (event: Event) => {
    const detail = (event as CustomEvent<PhoneEventDetail>).detail || {};
    const contactId = String(detail.contactId || '').trim();
    if (!contactId) return;
    collectUnsyncedPhoneMessages(contactId);
  };

  topDoc.addEventListener('phone-message-received', phoneMessageReceivedHandler);
  topDoc.addEventListener('phone-ai-generation-complete', phoneAIGenCompleteHandler);
  phoneTtsBridgeBound = true;
  log('手机消息 TTS 桥接已启用');
}

function unbindPhoneTTSBridge(): void {
  if (!phoneTtsBridgeBound) return;

  const top = getTopWindow();
  const topDoc = top.document ?? document;

  if (phoneMessageReceivedHandler) {
    topDoc.removeEventListener('phone-message-received', phoneMessageReceivedHandler);
  }
  if (phoneAIGenCompleteHandler) {
    topDoc.removeEventListener('phone-ai-generation-complete', phoneAIGenCompleteHandler);
  }

  phoneMessageReceivedHandler = null;
  phoneAIGenCompleteHandler = null;
  phoneTtsQueue.length = 0;
  phoneTtsQueueRunning = false;
  phoneTtsBridgeBound = false;
}

function bindBaibaiPhoneTTSBridge(): void {
  if (baibaiPhoneTtsBridgeBound) return;

  resetBaibaiAssistantSeenState();
  markExistingBaibaiMessagesAsSeen();

  const sync = () => {
    collectUnsyncedBaibaiMessages();
  };

  const onChatChanged = () => {
    resetBaibaiAssistantSeenState();
    markExistingBaibaiMessagesAsSeen();
  };

  const eventKeys = ['GENERATION_ENDED', 'MESSAGE_UPDATED', 'MESSAGE_SWIPED'] as const;
  eventKeys.forEach((eventKey) => {
    const stop = bindTavernEvent(eventKey, sync);
    if (stop) baibaiEventStops.push(stop);
  });

  const chatChangedStop = bindTavernEvent('CHAT_CHANGED', onChatChanged);
  if (chatChangedStop) {
    baibaiEventStops.push(chatChangedStop);
  }

  if (baibaiEventStops.length === 0) {
    baibaiPhonePollTimer = window.setInterval(() => {
      collectUnsyncedBaibaiMessages();
    }, 1200);
  }

  baibaiPhoneTtsBridgeBound = true;
  log('柏柏小手机 TTS 桥接已启用');
}

function unbindBaibaiPhoneTTSBridge(): void {
  if (!baibaiPhoneTtsBridgeBound) return;

  baibaiEventStops.forEach((stop) => {
    stop.stop();
  });
  baibaiEventStops.length = 0;

  if (baibaiPhonePollTimer !== null) {
    window.clearInterval(baibaiPhonePollTimer);
    baibaiPhonePollTimer = null;
  }

  resetBaibaiAssistantSeenState();
  baibaiPhoneTtsBridgeBound = false;
}

function applyEmotionToLive2D(tag: EmotionTag): boolean {
  try {
    const model = Live2DManager.model as any;
    if (!model) return false;

    let applied = false;

    const cfg = getEmotionConfigByTag(tag, settings.value.emotionConfigs);
    const expression = matchLive2DExpression(model, tag, cfg?.live2dExpression);
    if (expression) {
      Live2DManager.playExpression(expression);
      applied = true;
    }

    const motion = matchLive2DMotion(model, tag, cfg?.live2dMotion);
    if (motion) {
      Live2DManager.playMotion(motion.group, motion.index);
      applied = true;
    }
    return applied;
  } catch (e) {
    logError('表情联动播放失败', e);
    return false;
  }
}

watch(showSettings, (visible) => {
  log(visible ? '设置面板已显示' : '设置面板已关闭');
});

function registerGlobalOpenSettings(): void {
  try {
    const top = window.parent ?? window;
    const fn = () => {
      uiStore.openSettings();
      log('通过全局函数打开设置面板');
    };
    (top as any)[OPEN_SETTINGS_FN_KEY] = fn;
    globalOpenSettingsFn = fn;
  } catch (e) {
    notifyInitError('注册全局设置打开函数失败', e);
  }
}

function unregisterGlobalOpenSettings(): void {
  try {
    const top = window.parent ?? window;
    if (globalOpenSettingsFn && (top as any)[OPEN_SETTINGS_FN_KEY] === globalOpenSettingsFn) {
      delete (top as any)[OPEN_SETTINGS_FN_KEY];
    }
  } catch {
    // ignore
  } finally {
    globalOpenSettingsFn = null;
  }
}

registerGlobalOpenSettings();

function openFunctionMenu(e: GestureEvent): void {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
  } catch {
    // ignore
  }

  const top = getTopWindow();
  let placement: 'left' | 'right' = 'right';
  let x = e.clientX;
  let y = e.clientY;

  try {
    const stageEl = top.document.getElementById('desktop-pet-stage') as HTMLElement | null;
    const rect = stageEl?.getBoundingClientRect?.();
    const vw = top.innerWidth || top.document.documentElement.clientWidth || 0;

    if (rect && vw > 0) {
      placement = rect.left > vw / 2 ? 'left' : 'right';
      x = placement === 'left' ? rect.left - 10 : rect.right + 10;
      y = rect.top + rect.height * 0.5;
    } else if (vw > 0) {
      placement = e.clientX > vw / 2 ? 'left' : 'right';
    }
  } catch {
    // ignore
  }

  menuPlacement.value = placement;
  menuAnchor.value = { x, y };
  showMenu.value = true;
}

function toggleMotionLoop(): void {
  const next = !settings.value.autoMotionLoop;
  settings.value.autoMotionLoop = next;
  Live2DManager.setAutoMotionLoopEnabled(next);
}

function cyclePersona(): void {
  const personas = ['毒舌吐槽', '可爱卖萌', '冷静分析', '傲娇'] as const;
  const current = settings.value.commentStyle;
  const idx = personas.indexOf(current as any);
  const next = personas[(idx >= 0 ? idx + 1 : 0) % personas.length];
  settings.value.commentStyle = next;

  try {
    toastr.info(`已切换人设：${next}`);
  } catch {
    // ignore
  }
}

function openModelBrowser(): void {
  showMenu.value = false;
  showModelBrowser.value = true;
}

function onModelBrowserLoad(url: string): void {
  settings.value.modelPath = url;
  showModelBrowser.value = false;
  void onModelChange(url);
}

function onManualChat(message: string): void {
  void Commentator.chat(message);
}

function closePet(): void {
  if (petClosed) return;
  petClosed = true;
  initTaskId++;
  modelLoadTaskId++;
  clearModelLoadingHideTimer();
  clearStatusCheckTimer();
  clearViewportResizeSyncTimer();

  showMenu.value = false;
  showModelBrowser.value = false;
  uiStore.closeSettings();
  onBubbleHidden();
  unbindGlobalGazeFollow(true);

  unbindPhoneTTSBridge();
  unbindBaibaiPhoneTTSBridge();
  ChatMonitor.destroy();
  Commentator.destroy();
  try {
    TTSManager.stop();
    LipSyncManager.cleanup();
  } catch {
    // ignore
  }
  Live2DStage.hideLoadingProgress();
  Live2DManager.destroyModel();
  Live2DStage.destroy();

  try {
    toastr.info('桌面宠物已关闭');
  } catch {
    // ignore
  }
}

function getStageSize(scale: number): { width: number; height: number } {
  const safeScale = normalizePetScale(scale);
  return {
    width: Math.max(1, Math.round(BASE_STAGE_WIDTH * safeScale)),
    height: Math.max(1, Math.round(BASE_STAGE_HEIGHT * safeScale)),
  };
}

function normalizePetScale(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULTS.PET_SCALE;
  return Math.max(0.1, Math.min(3, parsed));
}

function clearModelLoadingHideTimer(): void {
  if (modelLoadingHideTimer === null) return;
  window.clearTimeout(modelLoadingHideTimer);
  modelLoadingHideTimer = null;
}

function clearStatusCheckTimer(): void {
  if (statusCheckTimer === null) return;
  window.clearTimeout(statusCheckTimer);
  statusCheckTimer = null;
}

function clearViewportResizeSyncTimer(): void {
  if (viewportResizeSyncTimer === null) return;
  window.clearTimeout(viewportResizeSyncTimer);
  viewportResizeSyncTimer = null;
}

function clearGazeFollowRaf(): void {
  if (gazeFollowRafId === null) return;
  const top = getTopWindow();
  try {
    top.cancelAnimationFrame(gazeFollowRafId);
  } catch {
    // ignore
  }
  gazeFollowRafId = null;
}

function isGazePointerTypeSupported(pointerType: string): boolean {
  return pointerType === 'mouse' || pointerType === 'pen';
}

function scheduleGazeFollow(clientX: number, clientY: number): void {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

  gazePendingPoint = { x: clientX, y: clientY };
  if (gazeFollowRafId !== null) return;

  const top = getTopWindow();
  gazeFollowRafId = top.requestAnimationFrame(() => {
    gazeFollowRafId = null;

    const point = gazePendingPoint;
    gazePendingPoint = null;
    if (!point) return;
    if (settings.value.gazeFollowMouseEnabled === false) return;
    if (Live2DStage.isPreviewMounted()) return;

    Live2DManager.focusByClientPoint(point.x, point.y, false);
  });
}

function bindGlobalGazeFollow(): void {
  if (gazeFollowBound) return;

  const top = getTopWindow();
  const topDoc = top.document ?? document;
  const handlePointerEvent = (event: PointerEvent) => {
    if (!isGazePointerTypeSupported(event.pointerType)) return;
    scheduleGazeFollow(event.clientX, event.clientY);
  };

  gazePointerMoveHandler = handlePointerEvent;
  gazePointerDownHandler = handlePointerEvent;

  topDoc.addEventListener('pointermove', gazePointerMoveHandler, { passive: true });
  topDoc.addEventListener('pointerdown', gazePointerDownHandler, { passive: true });
  gazeFollowBound = true;
}

function unbindGlobalGazeFollow(resetFocus = true): void {
  clearGazeFollowRaf();
  gazePendingPoint = null;

  const top = getTopWindow();
  const topDoc = top.document ?? document;

  if (gazePointerMoveHandler) {
    topDoc.removeEventListener('pointermove', gazePointerMoveHandler);
  }
  if (gazePointerDownHandler) {
    topDoc.removeEventListener('pointerdown', gazePointerDownHandler);
  }

  gazePointerMoveHandler = null;
  gazePointerDownHandler = null;
  gazeFollowBound = false;

  if (resetFocus) {
    Live2DManager.focusCenter(true);
  }
}

function syncGazeFollowBinding(): void {
  if (settings.value.gazeFollowMouseEnabled === false) {
    unbindGlobalGazeFollow(true);
    return;
  }
  bindGlobalGazeFollow();
}

function syncStageAfterViewportResize(reason: string): void {
  if (Live2DStage.isPreviewMounted()) return;

  const stageSize = getStageSize(settings.value.petScale);
  const recoverOnce = (label: string) => {
    Live2DStage.resizeFloating(stageSize.width, stageSize.height);
    const top = getTopWindow();
    const stageEl = top.document.getElementById('desktop-pet-stage') as HTMLElement | null;
    if (stageEl) {
      stageEl.style.display = 'block';
      stageEl.style.visibility = 'visible';
      stageEl.style.opacity = '1';
      stageEl.style.zIndex = '10000';
    }

    const stage = Live2DStage.getStage();
    const hasModelOnStage = !!stage && stage.children.length > 0;
    if (hasModelOnStage) {
      Live2DManager.updateScale(stageSize.width, stageSize.height, 1);
      log(`Viewport resize recovery synced model (${label})`);
      return;
    }

    Live2DManager.mountToStage(stageSize.width, stageSize.height, 1);
    log(`Viewport resize recovery remounted model (${label})`);
  };

  recoverOnce(`${reason}-pass1`);
  window.setTimeout(() => {
    if (Live2DStage.isPreviewMounted()) return;
    recoverOnce(`${reason}-pass2`);
  }, 220);

  scheduleStatusCheck(`${reason}-recover`);
}

function scheduleViewportResizeSync(reason: string): void {
  clearViewportResizeSyncTimer();
  viewportResizeSyncTimer = window.setTimeout(() => {
    viewportResizeSyncTimer = null;
    syncStageAfterViewportResize(reason);
  }, 160);
}

function bindViewportResizeRecovery(): void {
  const top = getTopWindow();

  boundWindowResizeHandler = () => {
    scheduleViewportResizeSync('window-resize');
  };

  try {
    top.addEventListener('resize', boundWindowResizeHandler, { passive: true });
  } catch (e) {
    logError('Failed to bind window.resize listener', e);
    boundWindowResizeHandler = null;
  }

  const viewport = top.visualViewport;
  if (!viewport) return;

  boundVisualViewportResizeHandler = () => {
    scheduleViewportResizeSync('visual-viewport-resize');
  };

  try {
    viewport.addEventListener('resize', boundVisualViewportResizeHandler, { passive: true });
  } catch (e) {
    logError('Failed to bind visualViewport.resize listener', e);
    boundVisualViewportResizeHandler = null;
  }
}

function unbindViewportResizeRecovery(): void {
  const top = getTopWindow();
  if (boundWindowResizeHandler) {
    try {
      top.removeEventListener('resize', boundWindowResizeHandler);
    } catch {
      // ignore
    }
    boundWindowResizeHandler = null;
  }

  const viewport = top.visualViewport;
  if (viewport && boundVisualViewportResizeHandler) {
    try {
      viewport.removeEventListener('resize', boundVisualViewportResizeHandler);
    } catch {
      // ignore
    }
    boundVisualViewportResizeHandler = null;
  }
}

function renderModelLoadProgress(progress: ModelLoadProgress): void {
  const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
  Live2DStage.showLoadingProgress(percent, progress.message);
}

function notifyInitError(message: string, err?: unknown): void {
  logError(message, err);
  try {
    toastr.error(message);
  } catch {
    // ignore
  }
}

async function loadModelWithProgress(path: string): Promise<boolean> {
  const taskId = ++modelLoadTaskId;
  clearModelLoadingHideTimer();
  renderModelLoadProgress({ percent: 0, message: '准备加载模型' });

  const loaded = await Live2DManager.loadModel(path, (progress) => {
    if (taskId !== modelLoadTaskId) return;
    renderModelLoadProgress(progress);
  });

  if (taskId !== modelLoadTaskId) {
    return loaded;
  }

  renderModelLoadProgress({
    percent: 100,
    message: loaded ? '模型加载完成' : '模型加载失败',
  });
  modelLoadingHideTimer = window.setTimeout(() => {
    if (taskId !== modelLoadTaskId) return;
    Live2DStage.hideLoadingProgress();
    modelLoadingHideTimer = null;
  }, loaded ? 400 : 15000);
  return loaded;
}

function scheduleStatusCheck(reason: string): void {
  clearStatusCheckTimer();
  if (petClosed) return;
  statusCheckTimer = window.setTimeout(() => {
    try {
      if (petClosed) return;
      const top = window.parent ?? window;
      const stageEl = top.document.getElementById('desktop-pet-stage') as HTMLElement | null;
      const rect = stageEl?.getBoundingClientRect?.();
      const rectSummary = rect
        ? `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
        : 'none';

      const pixiVersion = String((top as any).PIXI?.VERSION || '').trim() || 'none';
      const hasLive2d = !!(top as any).PIXI?.live2d?.Live2DModel;
      const hasModel = !!Live2DManager.model;
      const stageChildren = (Live2DStage.getStage()?.children?.length ?? 0) as number;

      const stageVisible =
        !!rect &&
        rect.width > 10 &&
        rect.height > 10 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < (top.innerHeight || 0) &&
        rect.left < (top.innerWidth || 0);

      if (stageVisible && hasLive2d && hasModel && stageChildren > 0) {
        statusCheckTimer = null;
        return;
      }

      if (stageEl) {
        const prevOutline = stageEl.style.outline;
        const prevBackground = stageEl.style.background;
        const prevZIndex = stageEl.style.zIndex;

        stageEl.style.outline = '2px dashed rgba(245, 158, 11, 0.95)';
        stageEl.style.background = 'rgba(245, 158, 11, 0.08)';
        stageEl.style.zIndex = '2147483647';

        window.setTimeout(() => {
          if (!stageEl?.ownerDocument?.documentElement?.contains(stageEl)) return;
          stageEl.style.outline = prevOutline;
          stageEl.style.background = prevBackground;
          stageEl.style.zIndex = prevZIndex;
        }, 10000);
      }

      const message =
        `桌面宠物未显示(${reason}) ` +
        `stage=${!!stageEl} rect=${rectSummary} visible=${stageVisible} ` +
        `pixi=${pixiVersion} live2d=${hasLive2d} model=${hasModel} children=${stageChildren}`;

      try {
        toastr.warning(message);
      } catch {
        // ignore
      }
    } catch (e) {
      notifyInitError('桌面宠物状态检查失败', e);
    } finally {
      statusCheckTimer = null;
    }
  }, 2500);
}

async function initPet() {
  const taskId = ++initTaskId;
  petClosed = false;
  try {
    log('桌面宠物初始化开始');
    if (taskId !== initTaskId || petClosed) return;
    const s = settings.value;

    try {
      setLipSyncRefs({
        getProxiedAudioUrl: (url: string) => TTSManager._getProxiedAudioUrl(url),
      });
      TTSManager.init();
    } catch (e) {
      logError('TTS 模块初始化失败（不影响模型显示）', e);
    }
    bindPhoneTTSBridge();
    bindBaibaiPhoneTTSBridge();

    Commentator.setCallback((text: string, isDone: boolean) => {
      const parsed = parseEmotionCotText(text, {
        enabled: !!settings.value.emotionCotEnabled,
        stripFromText: settings.value.emotionCotStripFromText !== false,
        configs: settings.value.emotionConfigs,
      });
      const splitResult = splitZhJaForDisplayAndTts(parsed.cleanText, !!settings.value.ttsBilingualZhJaEnabled);

      bubbleText.value = splitResult.displayText;
      bubbleDone.value = isDone;

      if (!isDone) return;
      const finalText = String(splitResult.displayText || '').trim();
      if (!finalText) return;
      const ttsText = String(splitResult.ttsText || '').trim();
      if (!ttsText) return;

      if (parsed.normalizedTag) {
        const applied = applyEmotionToLive2D(parsed.normalizedTag);
        if (!applied) {
          Live2DManager.playRandomAnimation();
        }
      } else {
        Live2DManager.playRandomAnimation();
      }

      const ttsEnabled = getTTSEnabled();
      const autoPlay = !!settings.value.ttsAutoPlay;
      const tagLabel = parsed.normalizedTag || '(none)';
      log(
        `生成完成，TTS检查: enabled=${ttsEnabled}, autoPlay=${autoPlay}, tag=${tagLabel}, textLen=${finalText.length}, ttsLen=${ttsText.length}, zhJa=${settings.value.ttsBilingualZhJaEnabled}, hasJa=${splitResult.hasJa}`,
      );
      if (!ttsEnabled) return;
      if (!autoPlay) return;

      const speaker = getCurrentCharacterId();
      const voiceName = String(settings.value.ttsDefaultSpeaker || '').trim();

      let context = String(parsed.context || '').trim();
      if (!context && parsed.normalizedTag) {
        const cfg = getEmotionConfigByTag(parsed.normalizedTag, settings.value.emotionConfigs);
        context = String(cfg?.ttsContext || '').trim();
      }

      log(`自动朗读: speaker=${speaker}, voice=${voiceName || '默认'}, context=${context || '无'}`);

      void (async () => {
        try {
          TTSManager.stop();

          const ttsOverrides: { speaker?: string; context?: string } = {};
          if (voiceName) ttsOverrides.speaker = voiceName;
          if (context) ttsOverrides.context = context;

          await TTSManager.speak(
            {
              type: 'dialogue',
              speaker,
              text: ttsText,
              tts: Object.keys(ttsOverrides).length > 0 ? ttsOverrides : undefined,
            },
            `desktop_pet_comment_${Date.now()}`,
          );
        } catch (e) {
          logError('自动朗读失败', e);
        }
      })();
    });

    const ready = await Live2DManager.init();
    if (!ready) {
      notifyInitError('Live2D SDK 初始化失败（可能是网络 CDN 不可用）');
      return;
    }
    log('Live2D SDK 初始化完成');

    Live2DManager.setAutoMotionLoopEnabled(s.autoMotionLoop);

    const initialScale = normalizePetScale(s.petScale);
    if (initialScale !== s.petScale) {
      settings.value.petScale = initialScale;
    }
    const stageSize = getStageSize(initialScale);

    const created = Live2DStage.create({
      width: stageSize.width,
      height: stageSize.height,
      position: { x: s.petPosition.x, y: s.petPosition.y },
      scale: initialScale,
      onPositionChange: (x: number, y: number) => {
        settings.value.petPosition = { x, y };
      },
      onScaleChange: (scale: number) => {
        const safeScale = normalizePetScale(scale);
        if (safeScale !== settings.value.petScale) {
          settings.value.petScale = safeScale;
        }
      },
      onTap: (_e: GestureEvent) => {
        log('单击宠物 -> 播放动作（不触发 LLM）');
        Live2DManager.playRandomAnimation();
      },
      onDoubleTap: (_e: GestureEvent) => {
        const motionEnabled = settings.value.doubleTapRandomMotionEnabled !== false;
        log(motionEnabled ? '双击宠物 -> 触发吐槽 + 随机动作' : '双击宠物 -> 触发吐槽');
        ChatMonitor.manualTrigger();
        if (motionEnabled) {
          Live2DManager.playRandomAnimation();
        }
      },
      onLongPress: (_e: GestureEvent) => {
        log('长按宠物 -> 打开功能菜单');
        openFunctionMenu(_e);
      },
    });

    if (!created) {
      notifyInitError('Live2D 舞台创建失败（可能是 WebGL 不可用）');
      return;
    }
    log('Live2D 舞台创建完成');

    const loaded = await loadModelWithProgress(s.modelPath);
    if (taskId !== initTaskId || petClosed) return;
    if (loaded) {
      Live2DManager.mountToStage(stageSize.width, stageSize.height, 1);
      log('Live2D 模型挂载完成');
    } else {
      notifyInitError('Live2D 模型加载失败（可在设置里更换模型或关闭 CDN）');
    }

    ChatMonitor.init(
      {
        autoTrigger: s.autoTrigger,
        triggerInterval: s.triggerInterval,
        triggerProbability: s.triggerProbability,
        commentTriggerMode: s.commentTriggerMode,
      },
      () => {
        void Commentator.generate();
      },
    );

    log('桌面宠物初始化完成');
    if (taskId !== initTaskId || petClosed) return;
    scheduleStatusCheck('init');
  } catch (e) {
    if (taskId !== initTaskId || petClosed) return;
    notifyInitError('桌面宠物初始化异常，请打开控制台查看错误', e);
  }
}

async function onModelChange(path: string) {
  if (petClosed) return;
  const nextPath = String(path || '').trim();
  const isLocalModel =
    nextPath.length > 0 &&
    nextPath.toLowerCase().startsWith(LOCAL_LIVE2D_MODEL_PATH_PREFIX.toLowerCase());

  if (isLocalModel) {
    try {
      const exists = await hasLive2DModel();
      if (!exists) {
        const message = '未找到已上传本地模型，请先在设置中上传 ZIP 模型。';
        log(`模型切换中止: local model missing, path=${nextPath}`);
        toastr.error(message);
        scheduleStatusCheck('model-change-local-missing');
        return;
      }
    } catch (e) {
      const message = `检查本地模型失败: ${e instanceof Error ? e.message : String(e)}`;
      log(`模型切换检查异常: path=${nextPath}`, e);
      toastr.error(message);
      scheduleStatusCheck('model-change-local-check-error');
      return;
    }
  }

  const loaded = await loadModelWithProgress(path);
  if (petClosed) return;
  if (loaded) {
    const stageSize = getStageSize(settings.value.petScale);
    Live2DManager.mountToStage(stageSize.width, stageSize.height, 1);
  } else if (isLocalModel) {
    const message = '本地模型加载失败，请尝试重新上传 ZIP 或切换远程模型。';
    log(`本地模型加载失败: path=${nextPath}`);
    toastr.error(message);
  }
  scheduleStatusCheck(isLocalModel ? 'model-change-local' : 'model-change');
}

function onBubbleHidden() {
  bubbleText.value = '';
  bubbleDone.value = true;
}

watch(
  () => ({
    autoTrigger: settings.value.autoTrigger,
    triggerInterval: settings.value.triggerInterval,
    triggerProbability: settings.value.triggerProbability,
    commentTriggerMode: settings.value.commentTriggerMode,
  }),
  (config) => {
    ChatMonitor.updateConfig(config);
  },
);

watch(
  () => settings.value.autoMotionLoop,
  (enabled) => {
    Live2DManager.setAutoMotionLoopEnabled(enabled);
  },
);

watch(
  () => settings.value.gazeFollowMouseEnabled,
  () => {
    syncGazeFollowBinding();
  },
);

watch(
  () => settings.value.petScale,
  (scale) => {
    const safeScale = normalizePetScale(scale);
    if (safeScale !== scale) {
      settings.value.petScale = safeScale;
      return;
    }
    const stageSize = getStageSize(safeScale);
    Live2DStage.resizeFloating(stageSize.width, stageSize.height);
    if (!Live2DStage.isPreviewMounted()) {
      Live2DManager.updateScale(stageSize.width, stageSize.height, 1);
    }
  },
);

onMounted(() => {
  petClosed = false;
  bindViewportResizeRecovery();
  syncGazeFollowBinding();
  initPet();
});

onUnmounted(() => {
  petClosed = true;
  initTaskId++;
  unbindViewportResizeRecovery();
  unbindGlobalGazeFollow(true);
  unregisterGlobalOpenSettings();
  unbindPhoneTTSBridge();
  unbindBaibaiPhoneTTSBridge();
  modelLoadTaskId++;
  clearModelLoadingHideTimer();
  clearStatusCheckTimer();
  clearViewportResizeSyncTimer();
  Live2DStage.hideLoadingProgress();
  ChatMonitor.destroy();
  Commentator.destroy();
  try {
    TTSManager.stop();
    LipSyncManager.cleanup();
  } catch {
    // ignore
  }
  Live2DManager.destroyModel();
  Live2DStage.destroy();
});
</script>
<style lang="scss" scoped>
@use './styles/theme-arknights.scss' as theme;

.browser-overlay {
  @include theme.overlay-backdrop(10003, 0.8);
  padding: 12px;
  box-sizing: border-box;
  overflow: auto;
}

.browser-dialog {
  width: min(980px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: theme.$ark-text-main;
  background: theme.$ark-base;
  font-family: theme.$font-cn;
  @include theme.tech-panel(theme.$ark-accent-yellow);
  @include theme.tech-grid(22px, 0.03);
}

.browser-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 225, 0, 0.36);
  background: rgba(0, 0, 0, 0.28);

  h3 {
    margin: 0;
    font-family: theme.$font-en;
    font-size: 15px;
    letter-spacing: 0.08em;
  }

  .close-btn {
    @include theme.ark-button-base;
    width: 34px;
    height: 28px;
    padding: 0;
    line-height: 1;
    font-size: 16px;
  }
}

.browser-dialog-body {
  padding: 14px 18px 16px;
  overflow: auto;
  flex: 1;
  @include theme.ark-scrollbar;
}

@media (max-width: 860px) {
  .browser-overlay {
    align-items: flex-start;
    padding:
      calc(env(safe-area-inset-top) + 6px)
      6px
      calc(env(safe-area-inset-bottom) + 6px);
  }

  .browser-dialog {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 12px);
    clip-path: none;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
  }
}

@media (max-width: 620px) {
  .browser-overlay {
    align-items: stretch;
    padding: 0;
  }

  .browser-dialog {
    width: 100vw;
    max-height: 100dvh;
    box-shadow: none;
    clip-path: none;
    border-left: none;
    border-right: none;
  }

  .browser-dialog-header {
    padding: 12px;
  }

  .browser-dialog-body {
    padding: 10px 12px 12px;
  }
}
</style>
