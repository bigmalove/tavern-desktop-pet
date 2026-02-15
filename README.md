# 酒馆桌面宠物

在 SillyTavern 聊天页面上显示一个 Live2D 桌面宠物，能监听聊天内容并通过 LLM 生成吐槽/评论，以气泡文字显示。

## 项目类型

**脚本项目**（仅 `index.ts`，无 `index.html`），运行在酒馆后台 iframe 中，通过 jQuery 和 Vue 向酒馆主页面注入 UI。

## 功能特性

- **Live2D 桌面宠物**：页面右下角显示可拖拽、可缩放的 Live2D 角色
- **智能吐槽**：监听聊天内容，自动或手动触发 LLM 生成评论
- **多种人设风格**：毒舌吐槽、可爱卖萌、冷静分析、傲娇，支持自定义
- **双 API 模式**：可使用酒馆主 API 或自定义 API（url/key/model）
- **流式气泡**：吐槽结果以打字机效果实时显示在宠物头顶
- **表情 COT 联动**：LLM 输出 `桌面宠物[表情|语气]: 正文`，解析后驱动 Live2D 表情/动作，并把语气传给 TTS（`contextTexts`）
- **TTS 配音**：吐槽完成后自动朗读（LittleWhiteBox / GPT-SoVITS），并支持口型同步（详见 `TTS.md`）
- **持久化配置**：所有设置通过脚本变量自动保存

## 目录结构

```
酒馆桌面宠物/
├── index.ts                  # 主入口（编排初始化、事件注册、资源清理）
│
├── core/                     # 核心配置层
│   ├── constants.ts          # 常量定义（CDN地址、推荐模型、默认值）
│   ├── emotion.ts            # 表情配置（别名映射、TTS语气、Live2D覆盖）
│   └── settings.ts           # 设置管理（Pinia store + Zod schema）
│
├── live2d/                   # Live2D 渲染层
│   ├── loader.ts             # SDK 动态加载器
│   ├── stage.ts              # PIXI.js 渲染舞台（定位、拖拽、缩放）
│   └── manager.ts            # 模型管理器（加载、表情、动作）
│   └── expression-motion.ts  # 表情/动作智能匹配（参考 galgame 通用生成器）
│
├── chat/                     # 聊天交互层
│   ├── monitor.ts            # 聊天事件监听器（消息门控）
│   ├── commentator.ts        # 吐槽生成器（LLM 调用）
│   ├── emotion-cot.ts        # 表情 COT 解析器（剥离前缀、提取语气）
│   └── prompt-templates.ts   # 吐槽风格提示词模板
│
├── ui/                       # UI 层（Vue 组件）
│   ├── PetContainer.vue      # 宠物主容器
│   ├── ChatBubble.vue        # 吐槽气泡组件
│   └── SettingsPanel.vue     # 设置面板
│
└── utils/                    # 工具函数
    ├── dom.ts                # DOM 操作辅助
    └── style-teleport.ts     # 样式传送到父窗口
```

## 架构设计

### 模块依赖关系

```
index.ts
  ├── core/settings.ts ← core/constants.ts
  ├── utils/style-teleport.ts
  │
  └── ui/PetContainer.vue（Vue 根组件）
        ├── ui/ChatBubble.vue
        ├── ui/SettingsPanel.vue
        │
        ├── live2d/manager.ts ← live2d/loader.ts
        │                     ← live2d/stage.ts
        │
        └── chat/commentator.ts ← chat/prompt-templates.ts
            chat/monitor.ts
```

### 各层职责

#### `index.ts` — 主入口

仅做编排，不含业务逻辑：

- `$(() => {})` 中初始化 Pinia、传送样式、挂载 Vue 应用
- `$(window).on('pagehide')` 清理 DOM 和样式
- 监听 `tavern_events.CHAT_CHANGED` 在聊天切换时重置监听状态（不重载页面）

#### `core/` — 核心配置

- **`constants.ts`**：CDN 地址、SDK URL、推荐模型列表、吐槽风格枚举、默认配置值
- **`settings.ts`**：Pinia store + Zod schema 定义所有用户可配置项，通过 `getVariables`/`replaceVariables` + `klona()` 持久化到脚本变量

#### `live2d/` — 渲染层

- **`loader.ts`**：将 PIXI.js、Cubism 2/4 Core、pixi-live2d-display 动态注入到父窗口 `<head>` 中
- **`stage.ts`**：创建 `position: fixed` 容器，使用 jQueryUI `.draggable()` 实现拖拽，监听鼠标滚轮实现缩放
- **`manager.ts`**：从 CDN 加载模型（通过 `/proxy?url=` 处理跨域），管理表情/动作列表，提供 `playExpression()`、`playMotion()` 接口

#### `chat/` — 聊天交互

- **`monitor.ts`**：参考骰子系统的 generationGate 模式
  - 监听 `GENERATION_ENDED`，通过 `ignoreNextCount` 计数器过滤自身 `generateRaw` 触发的事件
  - 消息计数 + 概率判断，决定是否自动触发吐槽
  - 暴露 `manualTrigger()` 供点击宠物时调用
- **`commentator.ts`**：双模式 LLM 调用
  - 酒馆主 API：`generateRaw({ should_silence: true, should_stream: true })`
  - 自定义 API：通过 `custom_api` 参数指定 url/key/model
  - 流式传输结果实时更新气泡文字
- **`prompt-templates.ts`**：4 种内置吐槽风格的 systemPrompt + responseFormat

#### `ui/` — 表现层

- **`PetContainer.vue`**：根组件，在 `onMounted` 中初始化全部模块（Live2D、Monitor、Commentator），注册设置按钮
- **`ChatBubble.vue`**：`position: absolute` 定位在宠物上方，CSS 动画入场/淡出，支持流式文本更新
- **`SettingsPanel.vue`**：通过 `eventOn(getButtonEvent('桌面宠物设置'))` 打开，分区配置（API / Live2D / 吐槽 / 表情 / TTS），双向绑定 Pinia store

### 核心数据流

```
用户发送消息 / 点击宠物
        │
        ▼
  ChatMonitor 判断是否触发
  (间隔 + 概率 / 手动)
        │
        ▼
  Commentator 组装提示词
  (风格模板 + 最近聊天记录)
        │
        ▼
  generateRaw() 静默调用 LLM
  (ignoreNextCount++ 防止误触发)
        │
        ▼
  流式结果 → ChatBubble 实时更新
        │
        ▼
  生成完成 → 解析表情COT → Live2D 播放对应表情/动作（匹配失败则回退随机）
        │
        ▼
  气泡延迟淡出
```

### 消息门控机制

防止后台/插件/自身生成误触发吐槽：

1. `Commentator` 调用 `generateRaw()` 前执行 `ChatMonitor.markSelfGeneration()`，令 `ignoreNextCount++`
2. `ChatMonitor` 在 `GENERATION_ENDED` 中检查 `ignoreNextCount`，若 > 0 则递减并跳过
3. 仅非自身的、非静默的 `GENERATION_ENDED` 才进入计数 + 概率判断逻辑

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript |
| 框架 | Vue 3 + Pinia |
| 数据校验 | Zod |
| 渲染 | PIXI.js + pixi-live2d-display |
| 动画 | GSAP + CSS Animations |
| DOM操作 | jQuery + jQuery UI |
| 模型来源 | jsDelivr CDN (Eikanya/Live2d-model) |
| 构建 | Webpack |

## 配置项

| 配置 | 说明 | 默认值 |
|------|------|--------|
| `apiMode` | API 模式（tavern / custom） | `tavern` |
| `apiConfig.url` | 自定义 API 地址 | — |
| `apiConfig.apiKey` | 自定义 API 密钥 | — |
| `apiConfig.model` | 模型名称 | `gpt-4o-mini` |
| `apiConfig.max_tokens` | 最大回复 tokens | `150` |
| `apiConfig.temperature` | 温度 | `0.9` |
| `apiConfig.sendWorldInfo` | 是否发送世界书提示词 | `false` |
| `modelPath` | Live2D 模型路径 | `live2d-widget-model/shizuku/index.json` |
| `petScale` | 宠物缩放 | `0.3` |
| `petPosition` | 宠物位置 (x, y) | 右下角 |
| `commentStyle` | 吐槽风格 | `毒舌吐槽` |
| `customPrompt` | 自定义提示词 | — |
| `autoTrigger` | 是否自动触发 | `true` |
| `triggerInterval` | 每 N 条消息触发 | `3` |
| `triggerProbability` | 触发概率 (0-100) | `60` |
| `maxChatContext` | 上下文聊天条数 | `10` |
| `emotionCotEnabled` | 启用表情 COT 输出 | `true` |
| `emotionCotStripFromText` | 从气泡/TTS 文本中剥离前缀 | `true` |
| `emotionConfigs` | 表情别名/语气/Live2D覆盖配置 | `10 个固定表情条目` |
