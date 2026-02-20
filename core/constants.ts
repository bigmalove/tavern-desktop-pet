/** 脚本名称 */
export const SCRIPT_NAME = '酒馆桌面宠物';

/** IndexedDB 配置 */
export const DB_NAME = 'DesktopPetPluginDB';
export const DB_VERSION = 1;
export const STORE_LIVE2D_MODELS = 'live2dModels';
export const STORE_SDK_CACHE = 'sdkCache';

/** Live2D runtime 类型 */
export type Live2DRuntimeType = 'legacy' | 'cubism5';

/** 本地模型路径协议（单槽覆盖） */
export const LOCAL_LIVE2D_MODEL_PATH_PREFIX = 'local://desktop-pet/';
export const LOCAL_LIVE2D_MODEL_SLOT_ID = 'default';
export const LOCAL_LIVE2D_MODEL_PATH = `${LOCAL_LIVE2D_MODEL_PATH_PREFIX}${LOCAL_LIVE2D_MODEL_SLOT_ID}`;
export const EMPTY_MOTION_GROUP_VALUE = '__desktop_pet_empty_motion_group__';

/** Live2D CDN 基础地址（使用 pixi-live2d-display 测试资源） */
export const LIVE2D_CDN_BASE = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/';

/** SDK CDN 地址 */
export const SDK_URLS = {
  PIXI: 'https://cdn.jsdelivr.net/npm/pixi.js@6.5.10/dist/browser/pixi.min.js',
  CUBISM4_CORE: 'https://cdn.jsdelivr.net/npm/live2dcubismcore@1.0.2/live2dcubismcore.min.js',
  CUBISM4_CORE_FALLBACK_URLS: Object.freeze([
    'https://gcore.jsdelivr.net/npm/live2dcubismcore@1.0.2/live2dcubismcore.min.js',
    'https://unpkg.com/live2dcubismcore@1.0.2/live2dcubismcore.min.js',
    'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  ]),
  CUBISM5_CORE: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
  CUBISM5_CORE_FALLBACK_URLS: Object.freeze([
    'https://cdn.jsdelivr.net/gh/bigmalove/galgame@main/dist/live2dcubismcore.min.js',
    'https://gcore.jsdelivr.net/gh/bigmalove/galgame@main/dist/live2dcubismcore.min.js',
  ]),
  CUBISM2_CORE: 'https://cdn.jsdelivr.net/gh/dylanNew/live2d/webgl/Live2D/lib/live2d.min.js',
  PIXI_LIVE2D_DISPLAY: 'https://cdn.jsdelivr.net/npm/pixi-live2d-display@0.4.0/dist/index.min.js',
  CUBISM5_RUNTIME: 'https://cdn.jsdelivr.net/gh/bigmalove/galgame@main/dist/cubism5.runtime.min.js',
  CUBISM5_RUNTIME_FALLBACK_URLS: Object.freeze([
    'https://gcore.jsdelivr.net/gh/bigmalove/galgame@main/dist/cubism5.runtime.min.js',
    'https://cdn.jsdelivr.net/gh/bigmalove/galgame@main/dist/cubism5.js',
    'https://gcore.jsdelivr.net/gh/bigmalove/galgame@main/dist/cubism5.js',
  ]),
} as const;

/** 内置推荐模型列表 */
export const RECOMMENDED_MODELS = [
  {
    name: 'Haru (Cubism 4)',
    path: 'haru/haru_greeter_t03.model3.json',
  },
  {
    name: 'Shizuku (Cubism 2)',
    path: 'shizuku/shizuku.model.json',
  },
] as const;

/** 吐槽风格枚举 */
export const COMMENT_STYLES = ['毒舌吐槽', '可爱卖萌', '冷静分析', '傲娇', '自定义'] as const;
export type CommentStyle = (typeof COMMENT_STYLES)[number];

/** 吐槽自动触发时机 */
export const COMMENT_TRIGGER_MODES = ['user', 'ai', 'both'] as const;
export type CommentTriggerMode = (typeof COMMENT_TRIGGER_MODES)[number];
export const COMMENT_TRIGGER_MODE_OPTIONS: ReadonlyArray<{
  value: CommentTriggerMode;
  label: string;
}> = [
  { value: 'user', label: '用户发送后评论' },
  { value: 'ai', label: 'AI回复后评论' },
  { value: 'both', label: '同时评论' },
];

/** 表情 COT 标签列表（固定） */
export const EMOTION_TAGS = [
  '默认',
  '微笑',
  '生气',
  '难过',
  '惊讶',
  '嘲讽',
  '害羞',
  '思考',
  '大笑',
  '搞怪',
] as const;
export type EmotionTag = (typeof EMOTION_TAGS)[number];

/** API source 选项 */
export const API_SOURCES = [
  { value: 'openai', label: 'OpenAI (兼容)' },
  { value: 'claude', label: 'Claude' },
  { value: 'makersuite', label: 'Google Gemini' },
  { value: 'openrouter', label: 'OpenRouter' },
] as const;

/** Eikanya Live2D 模型仓库配置 */
export const EIKANYA_REPO = 'Eikanya/Live2d-model';
export const EIKANYA_API_BASE = 'https://api.github.com/repos/Eikanya/Live2d-model/contents/';
export const EIKANYA_CDN_BASE = 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model@master/';
export const EIKANYA_RAW_BASE = 'https://raw.githubusercontent.com/Eikanya/Live2d-model/master/';

/** 默认配置值 */
export const DEFAULTS = {
  MODEL_PATH: 'shizuku/shizuku.model.json',
  PET_SCALE: 0.3,
  PET_POSITION: { x: -1, y: -1 }, // -1 表示使用默认位置
  AUTO_MOTION_LOOP: true,
  DOUBLE_TAP_RANDOM_MOTION_ENABLED: true,
  GAZE_FOLLOW_MOUSE_ENABLED: true,
  COMMENT_TRIGGER_MODE: 'ai' as CommentTriggerMode,
  COMMENT_STYLE: '毒舌吐槽' as CommentStyle,
  ROLEPLAY_NAME: '',
  ROLEPLAY_IGNORE_COMMENT_STYLE: false,
  SEND_CHARACTER_CARD_CONTENT: false,
  AUTO_TRIGGER: true,
  TRIGGER_INTERVAL: 3,
  TRIGGER_PROBABILITY: 60,
  MAX_CHAT_CONTEXT: 10,
  USE_TAMAKO_TODAY_SPECIAL: false,
  USE_DICE_DATABASE_REFERENCE: false,
  PHONE_MESSAGE_AUTO_READ: true,
  BAIBAI_PHONE_MESSAGE_AUTO_READ: false,
  MAX_TOKENS: 150,
  TEMPERATURE: 0.9,
  FREQUENCY_PENALTY: 0,
  PRESENCE_PENALTY: 0,
  TOP_P: 1,
  TOP_K: 0,
  BUBBLE_DURATION: -1,
} as const;
