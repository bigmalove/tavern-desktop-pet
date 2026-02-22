import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PetContainer from './ui/PetContainer.vue';
import { ChatMonitor } from './chat/monitor';
import { teleport_style, deteleport_style } from './utils/style-teleport';
import { error as logError, log, warn } from './utils/dom';
import { SCRIPT_NAME } from './core/constants';
import { useUiStore } from './core/ui';

const BUILD_TAG = '20260222.01';
const LEGACY_MENU_BUTTON_LABELS = new Set(['桌面宠物', '桌面宠物设置']);
const SETTINGS_LABEL = '桌面宠物设置';
const OPEN_SETTINGS_FN_KEY = '__desktopPetOpenSettings_v2';

// Pinia 必须在全局作用域创建，不能在 $(() => {}) 中
const pinia = createPinia();
const uiStore = useUiStore(pinia);
const EXTENSIONS_MENU_CONTAINER_ID = 'desktop-pet-settings-menu-container';
const EXTENSIONS_MENU_ITEM_ID = 'desktop-pet-settings-menu-item';
const EXTENSIONS_MENU_CLICK_NAMESPACE = '.desktopPetSettingsMenu';

let extensionsMenuRetryTimer: number | null = null;

function getParentDocument(): Document {
  try {
    return window.parent?.document ?? document;
  } catch {
    return document;
  }
}

function getTopWindow(): Window {
  return window.parent ?? window;
}

function bindExtensionsMenuDelegation(parentDoc: Document): void {
  const clickEvent = `click${EXTENSIONS_MENU_CLICK_NAMESPACE}`;
  $(parentDoc).off(clickEvent, `#${EXTENSIONS_MENU_ITEM_ID}`);
  $(parentDoc).on(clickEvent, `#${EXTENSIONS_MENU_ITEM_ID}`, (event) => {
    void onExtensionsMenuItemClick(event as unknown as JQuery.ClickEvent);
  });
}

function clearExtensionsMenuRetryTimer(): void {
  if (extensionsMenuRetryTimer !== null) {
    window.clearTimeout(extensionsMenuRetryTimer);
    extensionsMenuRetryTimer = null;
  }
}

function scheduleExtensionsMenuInjection(): void {
  if (extensionsMenuRetryTimer !== null) {
    return;
  }

  extensionsMenuRetryTimer = window.setTimeout(() => {
    extensionsMenuRetryTimer = null;
    injectExtensionsMenuItem();
  }, 1000);
}

async function onExtensionsMenuItemClick(event: JQuery.ClickEvent): Promise<void> {
  event.stopPropagation();
  log('设置菜单被点击，尝试打开设置面板');

  const parentDoc = getParentDocument();
  const $extensionsMenu = $('#extensionsMenu', parentDoc);
  const $extensionsMenuButton = $('#extensionsMenuButton', parentDoc);

  if ($extensionsMenuButton.length > 0 && $extensionsMenu.is(':visible')) {
    $extensionsMenuButton.trigger('click');
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 120);
    });
  }

  const top = getTopWindow() as any;
  const openSettings = top?.[OPEN_SETTINGS_FN_KEY];
  if (typeof openSettings === 'function') {
    openSettings();
    log('已通过全局打开函数请求打开设置面板');
  } else {
    uiStore.openSettings();
    log(`已通过 Pinia 请求打开设置面板 (showSettings=${String(uiStore.showSettings)})`);
  }

  window.setTimeout(() => {
    try {
      const overlay = parentDoc.querySelector('#desktop-pet-app .settings-overlay') as HTMLElement | null;
      const rect = overlay?.getBoundingClientRect?.();
      const summary = rect
        ? `${Math.round(rect.left)},${Math.round(rect.top)} ${Math.round(rect.width)}x${Math.round(rect.height)}`
        : 'none';
      const style = overlay ? (window.getComputedStyle(overlay) as CSSStyleDeclaration) : null;
      const styleSummary = style
        ? `position=${style.position} display=${style.display} width=${style.width} height=${style.height}`
        : 'style=none';
      log(`设置面板 DOM 检测: overlay=${!!overlay} rect=${summary} ${styleSummary}`);
    } catch (e) {
      warn('设置面板 DOM 检测失败', e);
    }
  }, 0);
}

function injectExtensionsMenuItem(): void {
  const parentDoc = getParentDocument();
  const $extensionsMenu = $('#extensionsMenu', parentDoc);

  if ($extensionsMenu.length === 0) {
    scheduleExtensionsMenuInjection();
    return;
  }

  bindExtensionsMenuDelegation(parentDoc);
  const $existingItem = $(`#${EXTENSIONS_MENU_ITEM_ID}`, parentDoc);
  if ($existingItem.length > 0) {
    return;
  }

  const $container = $(
    `<div class="extension_container interactable" id="${EXTENSIONS_MENU_CONTAINER_ID}" tabindex="0"></div>`,
  );

  const $item = $(
    `<div class="list-group-item flex-container flexGap5 interactable" id="${EXTENSIONS_MENU_ITEM_ID}" title="打开${SETTINGS_LABEL}"><div class="fa-fw fa-solid fa-paw extensionsMenuExtensionButton"></div><span>${SETTINGS_LABEL}</span></div>`,
  );

  $container.append($item);
  $extensionsMenu.append($container);
}

function removeExtensionsMenuItem(): void {
  clearExtensionsMenuRetryTimer();

  const parentDoc = getParentDocument();
  const clickEvent = `click${EXTENSIONS_MENU_CLICK_NAMESPACE}`;
  $(parentDoc).off(clickEvent, `#${EXTENSIONS_MENU_ITEM_ID}`);
  $(`#${EXTENSIONS_MENU_CONTAINER_ID}`, parentDoc).remove();
}

function removeLegacyMenuButtons(): void {
  try {
    const parentDoc = getParentDocument();
    $('.qr--button.menu_button.interactable', parentDoc)
      .filter((_idx, el) => LEGACY_MENU_BUTTON_LABELS.has(String($(el).text() || '').trim()))
      .remove();
  } catch (e) {
    warn('清理旧菜单按钮失败', e);
  }
}

$(() => {
  // 传送样式到父窗口
  teleport_style();

  try {
    log(`入口开始初始化(${BUILD_TAG})`);
    removeLegacyMenuButtons();
    window.setTimeout(() => {
      removeLegacyMenuButtons();
    }, 1200);

    // 创建 Vue 挂载点并添加到酒馆页面
    try {
      const parentDoc = getParentDocument();
      $('#desktop-pet-app', parentDoc).remove();
    } catch {
      // ignore
    }
    const $app = $('<div id="desktop-pet-app">').appendTo('body');
    const app = createApp(PetContainer);
    app.use(pinia);
    app.config.errorHandler = (err, _instance, info) => {
      logError(`Vue error: ${info}`, err);
    };
    app.config.warnHandler = (msg, _instance, trace) => {
      warn(`Vue warn: ${msg}${trace ? `\n${trace}` : ''}`);
    };
    app.mount($app[0]);
    injectExtensionsMenuItem();

    toastr.success(`${SCRIPT_NAME}加载成功(${BUILD_TAG})`);
    log(`入口初始化完成(${BUILD_TAG})`);

    // 聊天文件切换时重置监听状态（不重载页面）
    let chatId = SillyTavern.getCurrentChatId();
    eventOn(tavern_events.CHAT_CHANGED, (newChatId: string) => {
      if (chatId !== newChatId) {
        chatId = newChatId;
        ChatMonitor.resetState();
      }
    });
  } catch (e) {
    logError('入口初始化失败', e);
    toastr.error(`${SCRIPT_NAME}初始化失败(${BUILD_TAG})，请打开控制台查看报错`);
    $('#desktop-pet-app').remove();
  }
});

$(window).on('pagehide', () => {
  removeLegacyMenuButtons();
  removeExtensionsMenuItem();
  deteleport_style();
  $('#desktop-pet-app').remove();
  $('#desktop-pet-stage').remove();
});
