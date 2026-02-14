<template>
  <div>
    <ChatBubble :text="bubbleText" :isDone="bubbleDone" @hidden="onBubbleHidden" />
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
          <button class="close-btn" @click="showModelBrowser = false">✕</button>
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
import { getEmotionConfigByTag } from '../core/emotion';
import { useSettingsStore } from '../core/settings';
import { useUiStore } from '../core/ui';
import { Live2DManager, type ModelLoadProgress } from '../live2d/manager';
import { matchLive2DExpression, matchLive2DMotion } from '../live2d/expression-motion';
import { LipSyncManager, setLipSyncRefs } from '../live2d/lip-sync';
import { Live2DStage } from '../live2d/stage';
import type { EmotionTag } from '../core/constants';
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
const bubbleDone = ref(false);
const BASE_STAGE_WIDTH = 280;
const BASE_STAGE_HEIGHT = 360;
const OPEN_SETTINGS_FN_KEY = '__desktopPetOpenSettings_v2';
let globalOpenSettingsFn: (() => void) | null = null;

let modelLoadTaskId = 0;
let modelLoadingHideTimer: number | null = null;
let statusCheckTimer: number | null = null;

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

function openSettingsPanel(): void {
  uiStore.openSettings();
  log('打开设置面板');
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

// setup 阶段立刻注册，避免菜单点击时尚未就绪
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
  bubbleText.value = '';
  bubbleDone.value = false;
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
  const safeScale = Math.max(0.1, Math.min(3, scale || 1));
  return {
    width: Math.max(1, Math.round(BASE_STAGE_WIDTH * safeScale)),
    height: Math.max(1, Math.round(BASE_STAGE_HEIGHT * safeScale)),
  };
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

/** 初始化 Live2D 和所有模块 */
async function initPet() {
  try {
    log('桌面宠物初始化开始');
    const s = settings.value;

    // 初始化 TTS / 口型同步（不依赖 Live2D 是否加载成功）
    try {
      setLipSyncRefs({
        getProxiedAudioUrl: (url: string) => TTSManager._getProxiedAudioUrl(url),
      });
      TTSManager.init();
    } catch (e) {
      logError('TTS 模块初始化失败（不影响模型显示）', e);
    }

    // 注册设置按钮（无论 Live2D 是否加载成功都应可用）
    try {
      if (typeof appendInexistentScriptButtons === 'function') {
        appendInexistentScriptButtons([{ name: '桌面宠物设置', visible: true }]);
      }
      if (typeof eventOn === 'function' && typeof getButtonEvent === 'function') {
        eventOn(getButtonEvent('桌面宠物设置'), () => {
          openSettingsPanel();
        });
      }
    } catch (e) {
      notifyInitError('桌面宠物设置按钮注册失败（不影响模型显示）', e);
    }

    // 设置吐槽回调
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

      log(
        `自动朗读: speaker=${speaker}, voice=${voiceName || '默认'}, context=${context || '无'}`,
      );

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

    // 先初始化 Live2D SDK（加载 PIXI.js 等依赖）
    const ready = await Live2DManager.init();
    if (!ready) {
      notifyInitError('Live2D SDK 初始化失败（可能是网络/CDN 不可用）');
      return;
    }
    log('Live2D SDK 初始化完成');

    // 同步动作循环开关（挂载模型前设置，避免 mount 后立即启动）
    Live2DManager.setAutoMotionLoopEnabled(s.autoMotionLoop);

    // 创建 Live2D 舞台（尺寸随缩放同步变化）
    const stageSize = getStageSize(s.petScale);

    const created = Live2DStage.create({
      width: stageSize.width,
      height: stageSize.height,
      position: { x: s.petPosition.x, y: s.petPosition.y },
      scale: s.petScale,
      onPositionChange: (x: number, y: number) => {
        settings.value.petPosition = { x, y };
      },
      onScaleChange: (scale: number) => {
        settings.value.petScale = scale;
      },
      onTap: (_e: GestureEvent) => {
        // 单击：仅播放随机动画，不触发 LLM
        log('单击宠物 → 播放动画（不触发 LLM）');
        Live2DManager.playRandomAnimation();
      },
      onDoubleTap: (_e: GestureEvent) => {
        // 双击：触发 LLM 吐槽
        log('双击宠物 → 触发吐槽');
        ChatMonitor.manualTrigger();
      },
      onLongPress: (_e: GestureEvent) => {
        // 长按：打开功能菜单（手动聊天 / 动作循环 / 切换模型 / 切换人设）
        log('长按宠物 → 打开功能菜单');
        openFunctionMenu(_e);
      },
    });

    if (!created) {
      notifyInitError('Live2D 舞台创建失败（可能是 WebGL 不可用）');
      return;
    }
    log('Live2D 舞台创建完成');

    // 加载模型
    const loaded = await loadModelWithProgress(s.modelPath);
    if (loaded) {
      Live2DManager.mountToStage(stageSize.width, stageSize.height, 1);
      log('Live2D 模型挂载完成');
    } else {
      notifyInitError('Live2D 模型加载失败（可在设置里更换模型/关闭 CDN）');
    }

    // 初始化聊天监听
    ChatMonitor.init(
      {
        autoTrigger: s.autoTrigger,
        triggerInterval: s.triggerInterval,
        triggerProbability: s.triggerProbability,
      },
      () => {
        bubbleText.value = '';
        bubbleDone.value = false;
        Commentator.generate();
      },
    );

    log('桌面宠物初始化完成');
    scheduleStatusCheck('init');
  } catch (e) {
    notifyInitError('桌面宠物初始化异常，请打开控制台查看错误', e);
  }
}

/** 模型切换 */
async function onModelChange(path: string) {
  const loaded = await loadModelWithProgress(path);
  if (loaded) {
    const stageSize = getStageSize(settings.value.petScale);
    Live2DManager.mountToStage(stageSize.width, stageSize.height, 1);
  }
  scheduleStatusCheck('model-change');
}

/** 气泡隐藏 */
function onBubbleHidden() {
  bubbleText.value = '';
  bubbleDone.value = false;
}

// 监听设置变化，更新 monitor 配置
watch(
  () => ({
    autoTrigger: settings.value.autoTrigger,
    triggerInterval: settings.value.triggerInterval,
    triggerProbability: settings.value.triggerProbability,
  }),
  (config) => {
    ChatMonitor.updateConfig(config);
  },
);

// 监听动作循环开关
watch(
  () => settings.value.autoMotionLoop,
  (enabled) => {
    Live2DManager.setAutoMotionLoopEnabled(enabled);
  },
);

// 监听缩放变化
watch(
  () => settings.value.petScale,
  (scale) => {
    const stageSize = getStageSize(scale);
    Live2DStage.resizeFloating(stageSize.width, stageSize.height);
    if (!Live2DStage.isPreviewMounted()) {
      Live2DManager.updateScale(stageSize.width, stageSize.height, 1);
    }
  },
);

onMounted(() => {
  initPet();
});

onUnmounted(() => {
  unregisterGlobalOpenSettings();
  modelLoadTaskId++;
  clearModelLoadingHideTimer();
  clearStatusCheckTimer();
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
