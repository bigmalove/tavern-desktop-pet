<template>
  <div>
    <ChatBubble :text="bubbleText" :is-done="bubbleDone" @hidden="onBubbleHidden" />
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
import { Commentator } from '../chat/commentator';
import { parseEmotionCotText } from '../chat/emotion-cot';
import { ChatMonitor } from '../chat/monitor';
import { DEFAULTS, type EmotionTag } from '../core/constants';
import { getEmotionConfigByTag } from '../core/emotion';
import { useSettingsStore } from '../core/settings';
import { useUiStore } from '../core/ui';
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
let modelLoadingHideTimer: number | null = null;
let statusCheckTimer: number | null = null;
let viewportResizeSyncTimer: number | null = null;
let boundWindowResizeHandler: (() => void) | null = null;
let boundVisualViewportResizeHandler: (() => void) | null = null;

const showMenu = ref(false);
const menuAnchor = ref({ x: 0, y: 0 });
const menuPlacement = ref<'left' | 'right'>('left');
const showModelBrowser = ref(false);

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
  showMenu.value = false;
  showModelBrowser.value = false;
  uiStore.closeSettings();
  onBubbleHidden();

  ChatMonitor.destroy();
  Commentator.destroy();
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
  statusCheckTimer = window.setTimeout(() => {
    try {
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
  try {
    log('桌面宠物初始化开始');
    const s = settings.value;

    try {
      setLipSyncRefs({
        getProxiedAudioUrl: (url: string) => TTSManager._getProxiedAudioUrl(url),
      });
      TTSManager.init();
    } catch (e) {
      logError('TTS 模块初始化失败（不影响模型显示）', e);
    }

    Commentator.setCallback((text: string, isDone: boolean) => {
      const parsed = parseEmotionCotText(text, {
        enabled: !!settings.value.emotionCotEnabled,
        stripFromText: settings.value.emotionCotStripFromText !== false,
        configs: settings.value.emotionConfigs,
      });

      bubbleText.value = parsed.cleanText;
      bubbleDone.value = isDone;

      if (!isDone) return;
      const finalText = String(parsed.cleanText || '').trim();
      if (!finalText) return;

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
        `生成完成，TTS检查: enabled=${ttsEnabled}, autoPlay=${autoPlay}, tag=${tagLabel}, textLen=${finalText.length}`,
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
              text: finalText,
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
        log('双击宠物 -> 触发吐槽');
        ChatMonitor.manualTrigger();
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
    scheduleStatusCheck('init');
  } catch (e) {
    notifyInitError('桌面宠物初始化异常，请打开控制台查看错误', e);
  }
}

async function onModelChange(path: string) {
  const loaded = await loadModelWithProgress(path);
  if (loaded) {
    const stageSize = getStageSize(settings.value.petScale);
    Live2DManager.mountToStage(stageSize.width, stageSize.height, 1);
  }
  scheduleStatusCheck('model-change');
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
  bindViewportResizeRecovery();
  initPet();
});

onUnmounted(() => {
  unbindViewportResizeRecovery();
  unregisterGlobalOpenSettings();
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
