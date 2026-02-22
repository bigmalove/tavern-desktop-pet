<template>
  <div>
    <div v-if="visible" class="settings-overlay dp-settings-overlay" :style="overlayFallbackStyle" @click.self="close">
      <div class="settings-panel dp-settings-panel" :style="panelFallbackStyle">
        <div class="panel-header">
          <div class="header-title">
            <h3>桌面宠物控制终端</h3>
            <p>SYSTEM // SETTINGS</p>
          </div>
          <button class="close-btn" type="button" @click="close">CLOSE</button>
        </div>

        <div class="panel-main">
          <aside class="panel-nav">
            <button
              v-for="item in sectionTabs"
              :key="item.key"
              class="nav-btn"
              type="button"
              :class="{ active: activeSection === item.key }"
              @click="activeSection = item.key"
            >
              <span class="nav-index">{{ item.index }}</span>
              <span class="nav-label">{{ item.label }}</span>
              <span class="nav-sub">{{ item.en }}</span>
            </button>
          </aside>

          <div class="panel-body">
            <section class="setting-section" v-show="activeSection === 'api'">
              <h4>
                <span class="section-index">01</span>
                <span class="section-label">API 设置</span>
                <span class="section-sub">API CONTROL</span>
              </h4>

              <div class="form-group">
                <label>API 模式</label>
                <select v-model="settings.apiMode">
                  <option value="tavern">酒馆主 API</option>
                  <option value="custom">自定义 API</option>
                </select>
              </div>

              <template v-if="settings.apiMode === 'custom'">
                <div class="form-group">
                  <label>API Source</label>
                  <select v-model="settings.apiConfig.source">
                    <option v-for="src in apiSources" :key="src.value" :value="src.value">
                      {{ src.label }}
                    </option>
                  </select>
                </div>

                <div class="form-group">
                  <label>API URL</label>
                  <input type="text" v-model="settings.apiConfig.url" placeholder="https://api.openai.com/v1" />
                </div>

                <div class="form-group">
                  <label>API Key</label>
                  <input type="password" v-model="settings.apiConfig.apiKey" placeholder="sk-..." />
                </div>

                <div class="form-group">
                  <label>模型</label>
                  <div class="input-with-btn">
                    <input
                      v-if="modelList.length === 0"
                      type="text"
                      v-model="settings.apiConfig.model"
                      placeholder="gpt-4o-mini"
                    />
                    <select v-else v-model="settings.apiConfig.model">
                      <option v-for="m in modelList" :key="m" :value="m">{{ m }}</option>
                    </select>
                    <button
                      class="input-btn"
                      type="button"
                      @click="fetchModels"
                      :disabled="!settings.apiConfig.url || fetchingModels"
                    >
                      {{ fetchingModels ? '获取中...' : '获取模型' }}
                    </button>
                  </div>
                  <div v-if="modelFetchError" class="hint hint-error">{{ modelFetchError }}</div>
                </div>

                <div class="form-group">
                  <button
                    class="btn btn-test"
                    type="button"
                    :disabled="!settings.apiConfig.url || testingConnection"
                    @click="testConnection"
                  >
                    {{ testingConnection ? '测试中...' : '测试连接' }}
                  </button>
                  <span v-if="connectionStatus === 'success'" class="status-badge status-success">连接成功</span>
                  <span v-if="connectionStatus === 'fail'" class="status-badge status-fail">{{ connectionError }}</span>
                </div>
              </template>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.apiConfig.usePresetSampling" />
                  跟随酒馆预设采样参数
                </label>
                <div class="hint">启用后，采样参数将使用酒馆当前预设的值。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.apiConfig.sendWorldInfo" />
                  发送世界书（World Info）
                </label>
                <div class="hint">关闭后不注入世界书提示词，默认关闭。</div>
              </div>

              <template v-if="!settings.apiConfig.usePresetSampling">
                <div class="form-row">
                  <div class="form-group half">
                    <label>Max Tokens</label>
                    <input type="number" v-model.number="settings.apiConfig.max_tokens" min="1" max="4096" />
                  </div>
                  <div class="form-group half">
                    <label>Temperature ({{ temperatureLabel }})</label>
                    <input type="range" v-model.number="settings.apiConfig.temperature" min="0" max="2" step="0.1" />
                  </div>
                </div>

                <div class="advanced-toggle" @click="showAdvanced = !showAdvanced">
                  <span class="toggle-icon">{{ showAdvanced ? '▼' : '▶' }}</span>
                  高级采样参数
                </div>

                <div v-if="showAdvanced" class="advanced-params">
                  <div class="form-row">
                    <div class="form-group half">
                      <label>Frequency Penalty ({{ frequencyPenaltyLabel }})</label>
                      <input
                        type="range"
                        v-model.number="settings.apiConfig.frequency_penalty"
                        min="-2"
                        max="2"
                        step="0.1"
                      />
                    </div>
                    <div class="form-group half">
                      <label>Presence Penalty ({{ presencePenaltyLabel }})</label>
                      <input
                        type="range"
                        v-model.number="settings.apiConfig.presence_penalty"
                        min="-2"
                        max="2"
                        step="0.1"
                      />
                    </div>
                  </div>

                  <div class="form-row">
                    <div class="form-group half">
                      <label>Top P ({{ topPLabel }})</label>
                      <input type="range" v-model.number="settings.apiConfig.top_p" min="0" max="1" step="0.01" />
                    </div>
                    <div class="form-group half">
                      <label>Top K</label>
                      <input type="number" v-model.number="settings.apiConfig.top_k" min="0" max="500" />
                    </div>
                  </div>
                </div>
              </template>
            </section>

            <section class="setting-section" v-show="activeSection === 'live2d'">
              <h4>
                <span class="section-index">02</span>
                <span class="section-label">Live2D 模型</span>
                <span class="section-sub">MODEL CONTROL</span>
              </h4>

              <div class="form-group">
                <label>模型路径</label>
                <div class="input-with-btn">
                  <input
                    type="text"
                    v-model="customModelUrl"
                    placeholder="输入 .model.json 或 .model3.json 的完整 URL"
                    @keydown.enter="loadCustomUrl"
                  />
                  <button class="input-btn" type="button" @click="loadCustomUrl" :disabled="!customModelUrl.trim()">
                    加载
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label>推荐模型</label>
                <div class="model-list">
                  <button
                    v-for="m in recommendedModels"
                    :key="m.path"
                    class="model-btn"
                    type="button"
                    :class="{ active: settings.modelPath === m.path }"
                    @click="selectModel(m.path)"
                  >
                    {{ m.name }}
                  </button>
                  <button class="model-btn browse-btn" type="button" @click="showBrowser = true">浏览在线模型库</button>
                </div>
              </div>

              <div class="form-group">
                <label>本地 ZIP 模型（单槽覆盖）</label>
                <div class="model-list">
                  <button
                    class="model-btn"
                    type="button"
                    :disabled="localModelBusy"
                    @click="triggerLocalModelUpload"
                  >
                    {{ uploadingLocalModel ? '上传解析中...' : '上传 ZIP 模型' }}
                  </button>
                  <button
                    class="model-btn"
                    type="button"
                    :disabled="localModelBusy || !localModelExists"
                    @click="useUploadedModel"
                  >
                    使用已上传模型
                  </button>
                  <button
                    class="model-btn"
                    type="button"
                    :disabled="localModelBusy || !localModelExists"
                    @click="clearUploadedModel"
                  >
                    清除已上传模型
                  </button>
                </div>
                <input
                  ref="localModelFileInput"
                  class="hidden-file-input"
                  type="file"
                  accept=".zip,application/zip"
                  @change="onLocalModelFileChange"
                />
                <div class="hint">上传成功后会自动切换到本地路径：{{ LOCAL_LIVE2D_MODEL_PATH }}</div>
                <div v-if="localModelStatus" class="hint">{{ localModelStatus }}</div>
                <div v-if="localModelError" class="hint hint-error">{{ localModelError }}</div>
                <div v-if="localModelInfo" class="local-model-info">
                  <div>文件：{{ localModelInfo.fileName }}</div>
                  <div>版本：Cubism {{ localModelInfo.cubismVersion ?? '未知' }}</div>
                  <div>Runtime：{{ runtimeLabel(localModelInfo.runtimeType) }}</div>
                  <div>上传时间：{{ formatLocalUploadTime(localModelInfo.uploadTime) }}</div>
                  <div>文件大小：{{ formatFileSize(localModelInfo.fileSize) }}</div>
                </div>
                <div v-else class="hint">当前没有已上传本地模型。</div>
              </div>

              <div class="form-group">
                <label>宠物缩放 ({{ petScaleLabel }})</label>
                <input type="range" v-model.number="settings.petScale" min="0.1" max="3" step="0.05" />
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.useCdn" />
                  使用 CDN 加速（jsDelivr）
                </label>
                <div class="hint">关闭后将直接从 GitHub 原始地址加载，适用于 CDN 不可用时。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.doubleTapRandomMotionEnabled" />
                  双击随机触发动作
                </label>
                <div class="hint">关闭后，双击仍会触发吐槽，但不再追加随机动作。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.gazeFollowMouseEnabled" />
                  视线跟随鼠标
                </label>
                <div class="hint">全页面范围生效；仅响应鼠标/触控笔，触屏手势不会驱动视线。</div>
              </div>
            </section>

            <section class="setting-section" v-show="activeSection === 'comment'">
              <h4>
                <span class="section-index">03</span>
                <span class="section-label">吐槽设置</span>
                <span class="section-sub">COMMENT SYSTEM</span>
              </h4>

              <div class="form-group">
                <label>吐槽风格</label>
                <select v-model="settings.commentStyle">
                  <option v-for="style in commentStyles" :key="style" :value="style">
                    {{ style }}
                  </option>
                </select>
              </div>

              <div class="form-group" v-if="settings.commentStyle === '自定义'">
                <label>自定义提示词</label>
                <textarea v-model="settings.customPrompt" rows="4" placeholder="输入自定义的系统提示词..."></textarea>
              </div>

              <div class="form-group">
                <label>角色名（留空则关闭角色视角）</label>
                <input type="text" v-model="settings.roleplayName" placeholder="例如：阿米娅" />
                <div class="hint">填写后，吐槽和手动聊天会以该角色视角发言。</div>
              </div>

              <div class="form-group">
                <label>
                  <input
                    type="checkbox"
                    v-model="settings.roleplayIgnoreCommentStyle"
                    :disabled="!settings.roleplayName.trim()"
                  />
                  角色模式下忽略吐槽风格
                </label>
                <div class="hint">开启后将不再套用风格提示词，仅按角色设定发言。</div>
              </div>

              <div class="form-group">
                <label>
                  <input
                    type="checkbox"
                    v-model="settings.sendCharacterCardContent"
                    :disabled="!settings.roleplayName.trim()"
                  />
                  发送角色卡内容（当前聊天角色）
                </label>
                <div class="hint">开启后会附带当前角色卡描述/性格/场景等内容。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.autoTrigger" />
                  启用自动触发
                </label>
              </div>

              <template v-if="settings.autoTrigger">
                <div class="form-group">
                  <label>触发时机</label>
                  <select v-model="settings.commentTriggerMode">
                    <option v-for="option in commentTriggerModeOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </div>

                <div class="form-row">
                  <div class="form-group half">
                    <label>触发间隔（每 N 条消息）</label>
                    <input type="number" v-model.number="settings.triggerInterval" min="1" max="100" />
                  </div>
                  <div class="form-group half">
                    <label>触发概率（{{ settings.triggerProbability }}%）</label>
                    <input type="range" v-model.number="settings.triggerProbability" min="0" max="100" />
                  </div>
                </div>
              </template>

              <div class="form-group">
                <label>传给 LLM 的最近聊天条数</label>
                <input type="number" v-model.number="settings.maxChatContext" min="1" max="50" />
              </div>

              <div class="form-group">
                <label>气泡自动关闭时间（秒）</label>
                <input type="number" v-model.number="settings.bubbleDuration" min="-1" max="600" step="1" />
                <div class="hint">默认 -1 不自动关闭；设置为 0 表示生成完成后立即关闭。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.phoneMessageAutoRead" />
                  读【毛球点心铺】手机消息
                </label>
                <div class="hint">仅朗读 NPC 文本回复；需同时启用 TTS 配音与自动播放。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.baibaiPhoneMessageAutoRead" />
                  读【柏柏小手机】手机消息
                </label>
                <div class="hint">仅朗读 NPC 文本回复；需同时启用 TTS 配音与自动播放。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.useTamakoTodaySpecial" />
                  兼容 Tamako 今日特选
                </label>
                <div class="hint">开启后会优先读取 Tamako Market 今日特选作为上下文。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.useDiceDatabaseReference" />
                  参考数据库（建议 + 点评）
                </label>
                <div class="hint">启用后会读取骰子数据库摘要作为参考内容。</div>
              </div>

              <div class="form-group" v-if="settings.useDiceDatabaseReference">
                <label>可见数据库表（勾选后才会被引用）</label>

                <div class="form-row">
                  <div class="form-group half">
                    <button
                      class="btn btn-test"
                      type="button"
                      @click="refreshDiceReferenceSheetOptions"
                      :disabled="refreshingDiceSheetOptions"
                    >
                      {{ refreshingDiceSheetOptions ? '刷新中...' : '刷新表列表' }}
                    </button>
                  </div>
                  <div class="form-group half">
                    <button class="btn btn-secondary" type="button" @click="selectAllDiceReferenceSheets">全选</button>
                  </div>
                </div>

                <div class="form-group">
                  <button class="btn btn-secondary" type="button" @click="clearDiceReferenceSheets">清空筛选</button>
                  <div class="hint">{{ diceReferenceSheetSummary }}</div>
                </div>

                <div class="dice-sheet-list" v-if="diceReferenceSheetOptions.length > 0">
                  <label class="dice-sheet-item" v-for="sheetName in diceReferenceSheetOptions" :key="sheetName">
                    <input
                      type="checkbox"
                      :checked="isDiceSheetVisible(sheetName)"
                      @change="onToggleDiceSheetVisibility(sheetName, $event)"
                    />
                    <span>{{ sheetName }}</span>
                  </label>
                </div>
                <div class="hint" v-else>未读取到表名，可先在骰子系统中完成一次数据库更新后再刷新。</div>
              </div>
            </section>

            <section class="setting-section" v-show="activeSection === 'expression'">
              <h4>
                <span class="section-index">04</span>
                <span class="section-label">表情设置</span>
                <span class="section-sub">EMOTION COT</span>
              </h4>

              <div class="emotion-layout">
                <div class="emotion-configs">
                  <div class="form-group">
                    <label>
                      <input type="checkbox" v-model="settings.emotionCotEnabled" />
                      启用表情 COT
                    </label>
                    <div class="hint">
                      开启后，LLM 将按 <code>桌面宠物[表情|语气]: 正文</code> 输出；气泡/TTS 会自动剥离前缀并联动 Live2D。
                    </div>
                    <div class="hint">表情列表：{{ emotionTags.join('、') }}</div>
                  </div>

                  <div class="form-group" v-if="settings.emotionCotEnabled">
                    <label>
                      <input type="checkbox" v-model="settings.emotionCotStripFromText" />
                      从气泡/TTS 文本中剥离前缀
                    </label>
                    <div class="hint">建议保持开启，否则会朗读包含前缀的完整文本。</div>
                  </div>

                  <div class="form-row">
                    <div class="form-group half">
                      <button class="btn btn-secondary" type="button" @click="resetEmotionConfigs">重置为默认表情配置</button>
                    </div>
                    <div class="form-group half">
                      <button
                        class="btn btn-test"
                        type="button"
                        @click="refreshLive2DLists"
                        :disabled="refreshingLive2dLists"
                      >
                        {{ refreshingLive2dLists ? '刷新中...' : '刷新模型表情/动作列表' }}
                      </button>
                    </div>
                  </div>

                  <div class="form-row">
                    <div class="form-group half">
                      <button class="btn btn-test" type="button" @click="autoMatchLive2DOverrides(false)">
                        自动匹配（填充空白覆盖）
                      </button>
                    </div>
                    <div class="form-group half">
                      <button class="btn btn-secondary" type="button" @click="autoMatchLive2DOverrides(true)">
                        自动匹配全部（覆盖）
                      </button>
                    </div>
                  </div>

                  <div class="form-group">
                    <button class="btn btn-secondary" type="button" @click="clearLive2DOverrides">清空 Live2D 覆盖</button>
                    <div class="hint">{{ live2dListSummary }}</div>
                  </div>

                  <div class="form-group">
                    <div class="advanced-toggle" @click="showEmotionAdvanced = !showEmotionAdvanced">
                      <span class="toggle-icon">{{ showEmotionAdvanced ? '▼' : '▶' }}</span>
                      <span>{{ showEmotionAdvanced ? '隐藏高级选项' : '显示高级选项' }}</span>
                    </div>
                    <div class="hint">高级选项包含：别名映射、TTS 默认语气、动作启用开关。</div>
                  </div>

                  <div class="emotion-map-table">
                    <div class="emotion-map-head">
                      <div>标签</div>
                      <div>→</div>
                      <div>Live2D 表情（Expression）</div>
                      <div>Live2D 动作（Motion）</div>
                      <div>预览</div>
                    </div>

                    <div v-for="cfg in settings.emotionConfigs" :key="cfg.tag" class="emotion-map-row">
                      <div class="emotion-map-tag">{{ cfg.tag }}</div>
                      <div class="emotion-map-arrow">→</div>

                      <select v-model="cfg.live2dExpression">
                        <option value="">（自动匹配）</option>
                        <option
                          v-if="cfg.live2dExpression && !live2dExpressionOptionSet.has(cfg.live2dExpression)"
                          :value="cfg.live2dExpression"
                        >
                          {{ cfg.live2dExpression }}（自定义）
                        </option>
                        <option v-for="expr in live2dExpressionOptions" :key="expr" :value="expr">
                          {{ expr }}
                        </option>
                      </select>

                      <select
                        :value="getMotionOverrideValue(cfg)"
                        :disabled="!cfg.live2dMotion.enabled"
                        @change="onMotionOverrideChange(cfg, $event)"
                      >
                        <option value="">（自动匹配）</option>
                        <option
                          v-if="getMotionOverrideValue(cfg) && !live2dMotionOptionSet.has(getMotionOverrideValue(cfg))"
                          :value="getMotionOverrideValue(cfg)"
                        >
                          {{ getMotionOverrideLabel(cfg) }}（自定义）
                        </option>
                        <option v-for="opt in live2dMotionSelectOptions" :key="opt.key" :value="opt.value">
                          {{ opt.label }}
                        </option>
                      </select>

                      <button
                        class="btn btn-secondary emotion-map-preview-btn"
                        type="button"
                        title="预览动作"
                        @click="previewEmotion(cfg.tag)"
                      >
                        ▶
                      </button>
                    </div>
                  </div>

                  <div class="hint">左列绑定 Expressions，右列绑定 Motions（可填动作名或动作组名）。</div>

                  <div class="emotion-advanced-list" v-if="showEmotionAdvanced">
                    <div v-for="cfg in settings.emotionConfigs" :key="`advanced_${cfg.tag}`" class="emotion-advanced-item">
                      <div class="emotion-advanced-title">{{ cfg.tag }} · 高级</div>

                      <div class="form-row">
                        <div class="form-group half">
                          <label>别名（raw tag → 规范表情）</label>
                          <input
                            type="text"
                            :value="(cfg.aliases || []).join(', ')"
                            @blur="onAliasesBlur(cfg, $event)"
                            placeholder="逗号分隔，例如：开心, smile"
                          />
                          <div class="hint">当模型输出不在固定表情列表时，可用别名映射到本行规范表情。</div>
                        </div>

                        <div class="form-group half">
                          <label>TTS 默认语气（可选）</label>
                          <input type="text" v-model="cfg.ttsContext" placeholder="例如：轻松调侃地说" />
                          <div class="hint">当模型未输出 |语气 时，将把此处作为 contextTexts 传给 TTS。</div>
                        </div>
                      </div>

                      <div class="form-group">
                        <label>
                          <input type="checkbox" v-model="cfg.live2dMotion.enabled" />
                          启用动作（关闭后该标签仅切换表情）
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="emotion-preview-panel">
                  <div class="emotion-preview-header">
                    <span class="emotion-preview-title">模型预览</span>
                    <span class="emotion-preview-tag">标签: {{ previewTag }}</span>
                  </div>

                  <div class="emotion-preview-canvas" ref="live2dPreviewMountEl">
                    <div class="emotion-preview-interact" ref="live2dPreviewInteractEl"></div>
                    <div v-if="!Live2DManager.model" class="emotion-preview-empty">加载模型后可预览</div>
                  </div>

                  <div class="emotion-preview-controls">
                    <div class="emotion-zoom-row">
                      <span class="zoom-label">缩放</span>
                      <input
                        class="zoom-slider"
                        type="range"
                        min="0.5"
                        max="4"
                        step="0.05"
                        v-model.number="previewZoomFactor"
                        @input="applyPreviewViewport"
                      />
                      <span class="zoom-value">{{ Math.round(previewZoomFactor * 100) }}%</span>
                    </div>

                    <div class="emotion-preview-actions">
                      <button class="btn btn-secondary" type="button" @click="resetPreviewViewport">重置视图</button>
                      <button class="btn btn-secondary" type="button" @click="replayPreview">重播</button>
                    </div>

                    <div class="hint">提示：拖拽预览区可移动模型，滚轮可缩放。</div>
                    <div class="hint" :title="previewStatus">{{ previewStatus }}</div>
                  </div>
                </div>
              </div>
            </section>

            <section class="setting-section" v-show="activeSection === 'tts'">
              <h4>
                <span class="section-index">05</span>
                <span class="section-label">TTS 配音</span>
                <span class="section-sub">VOICE CONTROL</span>
              </h4>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="ttsEnabled" @change="onToggleTtsEnabled" />
                  启用 TTS 配音
                </label>
                <div class="hint">关闭后不会自动朗读吐槽/手动聊天结果。</div>
              </div>

              <div class="form-group">
                <label>TTS 引擎</label>
                <select v-model="settings.ttsProvider">
                  <option :value="TTS_PROVIDER.LITTLEWHITEBOX">小白X（豆包火山）</option>
                  <option :value="TTS_PROVIDER.GPT_SOVITS_V2">GPT-SoVITS v2ProPlus</option>
                  <option :value="TTS_PROVIDER.EDGE_TTS_DIRECT">EdgeTTS（必须是Edge浏览器）</option>
                </select>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.ttsAutoPlay" />
                  自动播放（吐槽完成后朗读）
                </label>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.ttsBilingualZhJaEnabled" />
                  中日双语模式（显示中文，TTS 发送日文）
                </label>
                <div class="hint">需模型按“中文文本【JP】日文文本”输出；未命中时自动回退中文朗读。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.phoneMessageAutoRead" />
                  手机消息自动朗读（仅 NPC 文本回复）
                </label>
                <div class="hint">仅朗读 sender=contact 且 type=text 的手机消息。</div>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.baibaiPhoneMessageAutoRead" />
                  柏柏小手机自动朗读（仅 NPC 文本回复）
                </label>
                <div class="hint">仅朗读 qq.private / qq.group 中的 NPC 文本消息。</div>
              </div>

              <div class="form-group">
                <label>默认音色</label>
                <div class="input-with-btn">
                  <select v-model="settings.ttsDefaultSpeaker">
                    <option value="">（不指定）</option>
                    <option v-for="v in ttsVoiceList" :key="v.name" :value="v.name">
                      {{ v.name }}{{ v.desc ? ' (' + v.desc + ')' : '' }}
                    </option>
                  </select>
                  <button class="input-btn" type="button" @click="refreshTtsVoices" :disabled="refreshingTtsVoices">
                    {{ refreshingTtsVoices ? '刷新中...' : '刷新音色' }}
                  </button>
                </div>
                <div class="hint">{{ ttsVoiceHint }}</div>
              </div>

              <div class="advanced-toggle" @click="showLipSyncAdvanced = !showLipSyncAdvanced">
                <span class="toggle-icon">{{ showLipSyncAdvanced ? '▼' : '▶' }}</span>
                口型同步高级兜底
              </div>

              <div v-if="showLipSyncAdvanced" class="advanced-params">
                <div class="form-group">
                  <label>
                    <input type="checkbox" v-model="settings.lipSyncManualParamsEnabled" />
                    启用手动嘴部参数
                  </label>
                  <div class="hint">自动识别失败时，使用下面参数名覆盖（如 Param58 / Param61）。</div>
                </div>

                <div class="form-group">
                  <label>嘴部参数 ID（逗号或换行分隔）</label>
                  <textarea
                    v-model="lipSyncManualParamsText"
                    rows="3"
                    placeholder="ParamMouthOpenY&#10;Param58"
                    @blur="applyLipSyncManualParams"
                  ></textarea>
                  <div class="hint">保存时会自动去重、去空白。</div>
                </div>
              </div>

              <div v-if="settings.ttsProvider === TTS_PROVIDER.GPT_SOVITS_V2" class="advanced-params">
                <div class="form-group">
                  <label>API 地址</label>
                  <input type="text" v-model="settings.gptSoVits.apiUrl" placeholder="http://127.0.0.1:9880" />
                </div>

                <div class="form-group">
                  <label>模型总目录 / 路径前缀</label>
                  <input
                    type="text"
                    v-model="settings.gptSoVits.importPathPrefix"
                    placeholder="D:/模型总目录"
                    @change="onGptImportPrefixChange"
                  />
                </div>

                <div class="form-group">
                  <label>
                    <input type="checkbox" v-model="settings.gptSoVits.useCorsProxy" />
                    使用酒馆代理（/proxy）
                  </label>
                  <div class="hint">局域网访问建议开启；修改 config 后需重启酒馆进程。</div>
                </div>

                <div class="form-group">
                  <label>模型切换方式</label>
                  <select v-model="settings.gptSoVits.modelSwitchMode" @change="onGptSwitchModeChange">
                    <option value="set_weights">set_weights（api_v2.py）</option>
                    <option value="set_model">set_model（api.py）</option>
                    <option value="none">不自动切模型</option>
                  </select>
                </div>

                <div v-if="isGptSetModelMode" class="form-group">
                  <label>set_model endpoint</label>
                  <input type="text" v-model="settings.gptSoVits.setModelEndpoint" placeholder="/set_model" />
                </div>

                <div class="form-group">
                  <label>
                    <input type="checkbox" v-model="settings.gptSoVits.strictWeightSwitch" />
                    strictWeightSwitch（切权重失败时中断播放）
                  </label>
                </div>

                <div class="form-group">
                  <label>模型管理（v0.9）</label>
                  <div class="local-model-info">{{ gptModelSummaryHint }}</div>
                  <div class="form-row">
                    <div class="form-group half">
                      <button class="btn btn-secondary" type="button" @click="openGptModelManager">打开模型管理器</button>
                    </div>
                    <div class="form-group half">
                      <button
                        class="btn btn-secondary"
                        type="button"
                        @click="refreshTtsVoices"
                        :disabled="refreshingTtsVoices"
                      >
                        {{ refreshingTtsVoices ? '刷新中...' : '刷新音色列表' }}
                      </button>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="form-group half">
                      <button class="btn btn-test" type="button" @click="testTts" :disabled="!ttsEnabled">试听</button>
                    </div>
                    <div class="form-group half">
                      <input type="text" v-model="ttsTestText" placeholder="试听文本" />
                    </div>
                  </div>
                  <div class="hint">已移除 JSON 手填入口，导入/导出/编辑请在“模型管理器”完成。</div>
                </div>
              </div>

              <div v-else class="form-group">
                <button class="btn btn-test" type="button" @click="testTts" :disabled="!ttsEnabled">试听</button>
                <input type="text" v-model="ttsTestText" placeholder="试听文本" />
              </div>

              <div class="form-group">
                <button class="btn btn-secondary" type="button" @click="stopTts">停止</button>
              </div>
            </section>

            <section class="setting-section" v-show="activeSection === 'about'">
              <h4>
                <span class="section-index">06</span>
                <span class="section-label">关于</span>
                <span class="section-sub">ABOUT & LICENSE</span>
              </h4>

              <div class="about-card">
                <div class="about-title">插件发布地址</div>
                <a
                  class="about-link"
                  href="https://discord.com/channels/1134557553011998840/1472242483806077061"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  https://discord.com/channels/1134557553011998840/1472242483806077061
                </a>
              </div>

              <div class="about-card">
                <div class="about-title">版权与使用声明</div>
                <ul class="about-list">
                  <li>
                    本插件加载或展示的 Live2D 模型及配套素材，其版权归原作者或原项目方所有；请在使用前自行确认并遵守对应授权条款。
                  </li>
                  <li>除权利人另有授权外，插件及示例素材仅用于学习、研究与交流，不得用于商业用途或再分发。</li>
                  <li>
                    本项目采用
                    <a
                      class="about-link"
                      href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      CC BY-NC-SA 4.0
                    </a>
                    共享协议。使用、改编与传播时请遵守“署名-非商业性使用-相同方式共享”，并对第三方素材单独核验授权。
                  </li>
                  <li>使用本插件及其衍生内容时，必须遵守你所在地及适用司法辖区的法律法规。</li>
                </ul>
              </div>
            </section>
          </div>
        </div>

        <div class="panel-footer">
          <button class="btn btn-secondary" type="button" @click="resetSettings">恢复默认</button>
          <button class="btn btn-primary" type="button" @click="close">确定</button>
        </div>
      </div>
    </div>

    <div
      v-if="showGptModelManager"
      class="browser-overlay dp-browser-overlay gpt-model-overlay"
      :style="overlayFallbackStyle"
      @click.self="closeGptModelManager"
    >
      <div class="browser-dialog dp-browser-dialog gpt-model-dialog" :style="panelFallbackStyle">
        <div class="browser-dialog-header gpt-model-header">
          <h3>GPT-SoVITS 模型管理（v0.9）</h3>
          <div class="gpt-model-header-actions">
            <button class="btn btn-secondary" type="button" @click="openGptModelManagerImportJson">导入JSON</button>
            <button class="btn btn-secondary" type="button" @click="openGptModelManagerImportFolder">文件夹导入</button>

            <button class="btn btn-secondary" type="button" @click="exportGptModelManagerModels">导出JSON</button>
            <button class="btn btn-secondary" type="button" @click="addGptModelManagerModel">添加模型</button>
            <button class="close-btn" type="button" @click="closeGptModelManager">X</button>
          </div>
        </div>

        <div class="browser-dialog-body gpt-model-body">
          <div class="gpt-model-tools">
            <input type="text" v-model="gptModelManagerSearch" placeholder="按模型名 / 描述 / ID 搜索" />
            <button class="btn btn-secondary" type="button" @click="saveGptModelManager">仅保存</button>
            <button class="btn btn-primary" type="button" @click="saveGptModelManagerAndClose">保存并关闭</button>
          </div>

          <input
            ref="gptModelManagerImportJsonInputRef"
            type="file"
            accept=".json,application/json"
            style="display: none"
            @change="onGptModelManagerImportJsonChange"
          />
          <input
            ref="gptModelManagerImportFolderInputRef"
            type="file"
            webkitdirectory
            directory
            multiple
            style="display: none"
            @change="onGptModelManagerImportFolderChange"
          />

          <div v-if="filteredGptModelManagerModels.length === 0" class="local-model-info">
            当前没有模型，点击“添加模型”或“导入JSON/文件夹导入”创建。
          </div>

          <div v-else class="gpt-model-card-list">
            <div v-for="model in filteredGptModelManagerModels" :key="model.id" class="gpt-model-card">
              <div class="gpt-model-card-head">
                <label>
                  <input type="checkbox" v-model="model.enabled" />
                  启用
                </label>
                <span class="gpt-model-id">{{ model.id }}</span>
              </div>

              <div class="form-row">
                <div class="form-group half">
                  <label>模型名</label>
                  <input type="text" v-model="model.name" placeholder="新模型" />
                </div>
                <div class="form-group half">
                  <label>描述</label>
                  <input type="text" v-model="model.desc" placeholder="可选描述" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group half">
                  <label>GPT 权重</label>
                  <input type="text" v-model="model.paths.gptWeightsPath" placeholder="GPT_weights/xxx.ckpt" />
                </div>
                <div class="form-group half">
                  <label>SoVITS 权重</label>
                  <input type="text" v-model="model.paths.sovitsWeightsPath" placeholder="SoVITS_weights/xxx.pth" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group half">
                  <label>默认参考音频 ID</label>
                  <select v-model="model.defaultRefId">
                    <option value="">未设置</option>
                    <option v-for="refAudio in model.refAudios" :key="refAudio.id" :value="refAudio.id">
                      {{ refAudio.id }}（{{ refAudio.name || '未命名' }}）
                    </option>
                  </select>
                </div>
                <div class="form-group half">
                  <label>默认参考音频路径</label>
                  <input
                    type="text"
                    v-model="model.paths.defaultRefAudioPath"
                    placeholder="wavs/xxx.wav"
                  />
                </div>
              </div>

              <div class="hint">
                参考音频 {{ model.refAudios.length }} 条，表情映射 {{ Object.keys(model.expressionRefMap || {}).length }} 条
              </div>

              <div class="gpt-model-card-actions">
                <button class="btn btn-secondary" type="button" @click="openGptModelEditor(model.id)">
                  编辑参考音频/映射
                </button>
                <button class="btn btn-secondary" type="button" @click="setGptModelManagerDefaultSpeaker(model)">
                  设为默认音色
                </button>
                <button class="btn btn-test" type="button" @click="testGptModelManagerModel(model.id)">
                  保存并试听
                </button>
                <button class="btn btn-secondary" type="button" @click="duplicateGptModelManagerModel(model.id)">复制</button>
                <button class="btn btn-secondary" type="button" @click="removeGptModelManagerModel(model.id)">删除</button>
              </div>
            </div>
          </div>
        </div>

        <div class="panel-footer">
          <button class="btn btn-secondary" type="button" @click="closeGptModelManager">取消</button>
          <button class="btn btn-secondary" type="button" @click="saveGptModelManager">仅保存</button>
          <button class="btn btn-primary" type="button" @click="saveGptModelManagerAndClose">保存并关闭</button>
        </div>
      </div>
    </div>

    <div
      v-if="showGptModelEditor && gptModelEditor"
      class="browser-overlay dp-browser-overlay gpt-model-overlay"
      :style="overlayFallbackStyle"
      @click.self="closeGptModelEditor"
    >
      <div class="browser-dialog dp-browser-dialog gpt-model-editor-dialog" :style="panelFallbackStyle">
        <div class="browser-dialog-header gpt-model-header">
          <h3>编辑模型：{{ gptModelEditor.name || gptModelEditor.id }}</h3>
          <button class="close-btn" type="button" @click="closeGptModelEditor">X</button>
        </div>

        <div class="browser-dialog-body gpt-model-body">
          <div class="form-row">
            <div class="form-group half">
              <label>ID（保存后会自动规范化）</label>
              <input type="text" v-model="gptModelEditor.id" placeholder="model_xxx" />
            </div>
            <div class="form-group half">
              <label>
                <input type="checkbox" v-model="gptModelEditor.enabled" />
                启用该模型
              </label>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>模型名称</label>
              <input type="text" v-model="gptModelEditor.name" placeholder="新模型" />
            </div>
            <div class="form-group half">
              <label>描述</label>
              <input type="text" v-model="gptModelEditor.desc" placeholder="可选描述" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>GPT 权重路径</label>
              <input type="text" v-model="gptModelEditor.paths.gptWeightsPath" placeholder="GPT_weights/xxx.ckpt" />
            </div>
            <div class="form-group half">
              <label>SoVITS 权重路径</label>
              <input
                type="text"
                v-model="gptModelEditor.paths.sovitsWeightsPath"
                placeholder="SoVITS_weights/xxx.pth"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>prompt_text（默认）</label>
              <input type="text" v-model="gptModelEditor.params.promptText" placeholder="参考文本" />
            </div>
            <div class="form-group half">
              <label>prompt_lang（默认）</label>
              <input type="text" v-model="gptModelEditor.params.promptLang" placeholder="zh" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>text_lang（默认）</label>
              <input type="text" v-model="gptModelEditor.params.textLang" placeholder="auto/zh/en/ja..." />
            </div>
            <div class="form-group half">
              <label>切分策略</label>
              <input type="text" v-model="gptModelEditor.params.textSplitMethod" placeholder="cut5" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>speed_factor</label>
              <input type="number" v-model.number="gptModelEditor.params.speedFactor" min="0.5" max="2" step="0.05" />
            </div>
            <div class="form-group half">
              <label>media_type</label>
              <select v-model="gptModelEditor.params.mediaType">
                <option value="wav">wav</option>
                <option value="ogg">ogg</option>
                <option value="raw">raw</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>
                <input type="checkbox" v-model="gptModelEditor.params.streamingMode" />
                streaming_mode
              </label>
            </div>
            <div class="form-group half">
              <label>
                <input type="checkbox" v-model="gptModelEditor.params.strictWeightSwitch" />
                strictWeightSwitch
              </label>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group half">
              <label>切换模式</label>
              <select v-model="gptModelEditor.params.modelSwitchMode">
                <option value="set_weights">set_weights</option>
                <option value="set_model">set_model</option>
                <option value="none">none</option>
              </select>
            </div>
            <div class="form-group half">
              <label>set_model endpoint</label>
              <input type="text" v-model="gptModelEditor.params.setModelEndpoint" placeholder="/set_model" />
            </div>
          </div>

          <div class="form-group">
            <label>参考音频列表</label>
            <div class="gpt-ref-list">
              <div
                v-for="(refAudio, refIndex) in gptModelEditor.refAudios"
                :key="`${refAudio.id || 'ref'}_${refIndex}`"
                class="gpt-ref-item"
              >
                <div class="form-row">
                  <div class="form-group half">
                    <label>参考ID</label>
                    <input type="text" v-model="refAudio.id" placeholder="ref_1" />
                  </div>
                  <div class="form-group half">
                    <label>名称</label>
                    <input type="text" v-model="refAudio.name" placeholder="默认" />
                  </div>
                </div>
                <div class="form-group">
                  <label>音频路径</label>
                  <input type="text" v-model="refAudio.path" placeholder="wavs/xxx.wav" />
                </div>
                <div class="form-row">
                  <div class="form-group half">
                    <label>prompt_text</label>
                    <input type="text" v-model="refAudio.promptText" placeholder="参考文本" />
                  </div>
                  <div class="form-group half">
                    <label>prompt_lang</label>
                    <input type="text" v-model="refAudio.promptLang" placeholder="zh" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group half">
                    <label>text_lang</label>
                    <input type="text" v-model="refAudio.textLang" placeholder="zh" />
                  </div>
                  <div class="form-group half gpt-ref-actions">
                    <button class="btn btn-secondary" type="button" @click="setGptModelEditorDefaultRef(refAudio.id)">
                      设为默认参考
                    </button>
                    <button class="btn btn-secondary" type="button" @click="removeGptModelEditorRefAudio(refIndex)">
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <button class="btn btn-secondary" type="button" @click="addGptModelEditorRefAudio">添加参考音频</button>
          </div>

          <div class="form-group">
            <label>表情映射（表情标签 -> 参考ID）</label>
            <div class="gpt-expression-map-list">
              <div
                v-for="(row, rowIndex) in gptModelEditorExpressionRows"
                :key="`expr_map_${rowIndex}`"
                class="gpt-expression-map-row"
              >
                <input type="text" v-model="row.expression" placeholder="开心" />
                <select v-model="row.refId">
                  <option value="">请选择参考音频</option>
                  <option v-for="refAudio in gptModelEditor.refAudios" :key="refAudio.id" :value="refAudio.id">
                    {{ refAudio.id }}（{{ refAudio.name || '未命名' }}）
                  </option>
                </select>
                <button class="btn btn-secondary" type="button" @click="removeGptModelEditorExpressionRow(rowIndex)">
                  删除
                </button>
              </div>
            </div>
            <button class="btn btn-secondary" type="button" @click="addGptModelEditorExpressionRow">添加映射</button>
          </div>
        </div>

        <div class="panel-footer">
          <button class="btn btn-secondary" type="button" @click="closeGptModelEditor">取消</button>
          <button class="btn btn-primary" type="button" @click="saveGptModelEditor">保存当前模型</button>
        </div>
      </div>
    </div>

    <div
      v-if="showBrowser"
      class="browser-overlay dp-browser-overlay"
      :style="overlayFallbackStyle"
      @click.self="showBrowser = false"
    >
      <div class="browser-dialog dp-browser-dialog" :style="panelFallbackStyle">
        <div class="browser-dialog-header">
          <h3>在线模型库</h3>
          <button class="close-btn" type="button" @click="showBrowser = false">X</button>
        </div>
        <div class="browser-dialog-body">
          <ModelBrowser :use-cdn="settings.useCdn" @cancel="showBrowser = false" @load-model="onBrowserLoad" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  getGptSoVitsVoiceList,
  getTTSEnabled,
  getTTSVoiceListAsync,
  inferGptSoVitsModelsFromFolderFiles,
  inferGptSoVitsVoicesFromFolderFiles,
  isAbsoluteFileSystemPath,
  normalizeGptSoVitsModelsForStore,
  normalizeGptSoVitsSwitchMode,
  normalizeGptSoVitsVoicesForStore,
  pickFirstUsableGptSoVitsVoice,
  setTTSEnabled,
  TTS_PROVIDER,
  type GptSoVitsModelStoreConfig,
  type GptSoVitsRefAudio,
  type TTSSpeakerVoice,
} from '../audio/tts-config';
import { TTSManager } from '../audio/tts-manager';
import {
  API_SOURCES,
  COMMENT_STYLES,
  COMMENT_TRIGGER_MODE_OPTIONS,
  DEFAULTS,
  EMOTION_TAGS,
  EMPTY_MOTION_GROUP_VALUE,
  LOCAL_LIVE2D_MODEL_PATH,
  LOCAL_LIVE2D_MODEL_SLOT_ID,
  RECOMMENDED_MODELS,
  SCRIPT_NAME,
  type EmotionTag,
  type Live2DRuntimeType,
} from '../core/constants';
import { createDefaultEmotionConfigs, parseAliasesText, type EmotionConfig } from '../core/emotion';
import { useSettingsStore } from '../core/settings';
import { deleteLive2DModel, getLive2DModel, hasLive2DModel, type StoredLive2DModel } from '../db/live2d-models';
import { matchLive2DExpression, matchLive2DMotion } from '../live2d/expression-motion';
import { Live2DManager } from '../live2d/manager';
import { Live2DStage } from '../live2d/stage';
import { Live2DUploader } from '../live2d/uploader';
import ModelBrowser from './ModelBrowser.vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  close: [];
  'model-change': [path: string];
}>();

type SectionKey = 'api' | 'live2d' | 'comment' | 'expression' | 'tts' | 'about';

const sectionTabs: ReadonlyArray<{
  key: SectionKey;
  index: string;
  label: string;
  en: string;
}> = [
  { key: 'api', index: '01', label: 'API 设置', en: 'API CONTROL' },
  { key: 'live2d', index: '02', label: 'Live2D', en: 'MODEL CONTROL' },
  { key: 'comment', index: '03', label: '吐槽', en: 'COMMENT SYSTEM' },
  { key: 'expression', index: '04', label: '表情', en: 'EMOTION COT' },
  { key: 'tts', index: '05', label: 'TTS', en: 'VOICE CONTROL' },
  { key: 'about', index: '06', label: '关于', en: 'ABOUT & LICENSE' },
];

const activeSection = ref<SectionKey>('api');

const store = useSettingsStore();
const { settings } = storeToRefs(store);

function toBoundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function ensureNumericSettingsIntegrity(): void {
  if (!settings.value.apiConfig || typeof settings.value.apiConfig !== 'object') {
    settings.value.apiConfig = {
      url: '',
      apiKey: '',
      model: 'gpt-4o-mini',
      source: 'openai',
      max_tokens: DEFAULTS.MAX_TOKENS,
      temperature: DEFAULTS.TEMPERATURE,
      frequency_penalty: DEFAULTS.FREQUENCY_PENALTY,
      presence_penalty: DEFAULTS.PRESENCE_PENALTY,
      top_p: DEFAULTS.TOP_P,
      top_k: DEFAULTS.TOP_K,
      usePresetSampling: false,
      sendWorldInfo: false,
    } as any;
  }

  const api = settings.value.apiConfig as any;
  api.max_tokens = Math.round(toBoundedNumber(api.max_tokens, DEFAULTS.MAX_TOKENS, 1, 4096));
  api.temperature = toBoundedNumber(api.temperature, DEFAULTS.TEMPERATURE, 0, 2);
  api.frequency_penalty = toBoundedNumber(api.frequency_penalty, DEFAULTS.FREQUENCY_PENALTY, -2, 2);
  api.presence_penalty = toBoundedNumber(api.presence_penalty, DEFAULTS.PRESENCE_PENALTY, -2, 2);
  api.top_p = toBoundedNumber(api.top_p, DEFAULTS.TOP_P, 0, 1);
  api.top_k = Math.round(toBoundedNumber(api.top_k, DEFAULTS.TOP_K, 0, 500));

  if (typeof api.url !== 'string') api.url = String(api.url ?? '');
  if (typeof api.apiKey !== 'string') api.apiKey = String(api.apiKey ?? '');
  if (typeof api.model !== 'string') api.model = String(api.model ?? 'gpt-4o-mini');
  if (typeof api.source !== 'string') api.source = String(api.source ?? 'openai');
  api.usePresetSampling = api.usePresetSampling === true;
  api.sendWorldInfo = api.sendWorldInfo === true;

  settings.value.petScale = toBoundedNumber(settings.value.petScale, DEFAULTS.PET_SCALE, 0.1, 3);
  const rawBubbleDuration =
    typeof settings.value.bubbleDuration === 'number'
      ? settings.value.bubbleDuration
      : Number(settings.value.bubbleDuration ?? Number.NaN);
  const bubbleDurationSeconds =
    Number.isFinite(rawBubbleDuration) && rawBubbleDuration > 600 ? rawBubbleDuration / 1000 : rawBubbleDuration;
  settings.value.bubbleDuration = Math.round(
    toBoundedNumber(bubbleDurationSeconds, DEFAULTS.BUBBLE_DURATION, -1, 600),
  );
}

const temperatureLabel = computed(() =>
  toBoundedNumber(settings.value.apiConfig?.temperature, DEFAULTS.TEMPERATURE, 0, 2).toFixed(1),
);
const frequencyPenaltyLabel = computed(() =>
  toBoundedNumber(settings.value.apiConfig?.frequency_penalty, DEFAULTS.FREQUENCY_PENALTY, -2, 2).toFixed(1),
);
const presencePenaltyLabel = computed(() =>
  toBoundedNumber(settings.value.apiConfig?.presence_penalty, DEFAULTS.PRESENCE_PENALTY, -2, 2).toFixed(1),
);
const topPLabel = computed(() => toBoundedNumber(settings.value.apiConfig?.top_p, DEFAULTS.TOP_P, 0, 1).toFixed(2));
const petScaleLabel = computed(() => toBoundedNumber(settings.value.petScale, DEFAULTS.PET_SCALE, 0.1, 3).toFixed(2));

ensureNumericSettingsIntegrity();

const recommendedModels = RECOMMENDED_MODELS;
const commentStyles = COMMENT_STYLES;
const commentTriggerModeOptions = COMMENT_TRIGGER_MODE_OPTIONS;
const apiSources = API_SOURCES;
const showBrowser = ref(false);
const customModelUrl = ref(settings.value.modelPath || '');
const localModelFileInput = ref<HTMLInputElement | null>(null);
const uploadingLocalModel = ref(false);
const localModelActionBusy = ref(false);
const localModelStatus = ref('');
const localModelError = ref('');
const localModelInfo = ref<StoredLive2DModel | null>(null);
const localModelBusy = computed(() => uploadingLocalModel.value || localModelActionBusy.value);
const localModelExists = computed(() => !!localModelInfo.value);

const diceReferenceSheetOptions = ref<string[]>([]);
const refreshingDiceSheetOptions = ref(false);

function normalizeDiceReferenceSheetName(value: unknown): string {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function dedupeDiceReferenceSheetNames(values: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const value of values) {
    const name = normalizeDiceReferenceSheetName(value);
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    list.push(name);
  }
  return list;
}

function parseDiceReferenceRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return null;
    try {
      return parseDiceReferenceRecord(JSON.parse(text));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isDiceReferencePayload(record: Record<string, unknown>): boolean {
  return Object.keys(record).some(key => key.startsWith('sheet_'));
}

function extractDiceReferenceSheetNamesFromPayload(payload: unknown): string[] {
  const record = parseDiceReferenceRecord(payload);
  if (!record) return [];

  let tableRecord: Record<string, unknown> | null = record;
  if (!isDiceReferencePayload(tableRecord)) {
    const nested = parseDiceReferenceRecord(tableRecord.independentData);
    if (!nested || !isDiceReferencePayload(nested)) {
      return [];
    }
    tableRecord = nested;
  }

  return dedupeDiceReferenceSheetNames(
    Object.keys(tableRecord)
      .filter(key => key.startsWith('sheet_'))
      .map(key => {
        const sheet = parseDiceReferenceRecord(tableRecord?.[key]);
        return sheet?.name ?? '';
      }),
  );
}

function pickDiceReferencePayloadFromIsolatedData(value: unknown): Record<string, unknown> | null {
  const isolated = parseDiceReferenceRecord(value);
  if (!isolated) return null;

  const keys = Object.keys(isolated);
  for (let i = keys.length - 1; i >= 0; i--) {
    const slot = parseDiceReferenceRecord(isolated[keys[i]]);
    if (!slot) continue;
    const payload = parseDiceReferenceRecord(slot.independentData);
    if (payload && isDiceReferencePayload(payload)) {
      return payload;
    }
  }
  return null;
}

function pickDiceReferencePayloadFromMessage(message: any): Record<string, unknown> | null {
  if (!message || typeof message !== 'object') return null;

  const directCandidates: unknown[] = [
    message.TavernDB_ACU_IndependentData,
    message.TavernDB_ACU_Data,
    message.TavernDB_ACU_SummaryData,
    message.data?.TavernDB_ACU_IndependentData,
    message.data?.TavernDB_ACU_Data,
    message.data?.TavernDB_ACU_SummaryData,
  ];
  for (const candidate of directCandidates) {
    const payload = parseDiceReferenceRecord(candidate);
    if (!payload) continue;
    if (isDiceReferencePayload(payload)) {
      return payload;
    }
    const nested = parseDiceReferenceRecord(payload.independentData);
    if (nested && isDiceReferencePayload(nested)) {
      return nested;
    }
  }

  const isolatedCandidates = [message.TavernDB_ACU_IsolatedData, message.data?.TavernDB_ACU_IsolatedData];
  for (const candidate of isolatedCandidates) {
    const payload = pickDiceReferencePayloadFromIsolatedData(candidate);
    if (payload) return payload;
  }

  return null;
}

function readDiceReferenceSheetNamesFromApi(): string[] {
  try {
    const topWindow = window.parent ?? window;
    const api = (topWindow as any)?.AutoCardUpdaterAPI;
    if (!api || typeof api.exportTableAsJson !== 'function') {
      return [];
    }
    return extractDiceReferenceSheetNamesFromPayload(api.exportTableAsJson());
  } catch {
    return [];
  }
}

function readDiceReferenceSheetNamesFromChat(): string[] {
  try {
    const messages = getChatMessages(`0-{{lastMessageId}}`, {
      role: 'all',
      hide_state: 'all',
    });
    const list = Array.isArray(messages) ? messages : [];
    for (let i = list.length - 1; i >= 0; i--) {
      const payload = pickDiceReferencePayloadFromMessage(list[i] as any);
      if (!payload) continue;
      const names = extractDiceReferenceSheetNamesFromPayload(payload);
      if (names.length > 0) return names;
    }
  } catch {
    // ignore
  }
  return [];
}

function getDiceReferenceSelectedSheets(): string[] {
  const raw = Array.isArray((settings.value as any).diceReferenceVisibleSheets)
    ? ((settings.value as any).diceReferenceVisibleSheets as unknown[])
    : [];
  return dedupeDiceReferenceSheetNames(raw.map(item => String(item ?? '')));
}

function setDiceReferenceSelectedSheets(next: string[]): void {
  (settings.value as any).diceReferenceVisibleSheets = dedupeDiceReferenceSheetNames(next);
}

function isDiceSheetVisible(sheetName: string): boolean {
  const selected = getDiceReferenceSelectedSheets();
  if (selected.length === 0) return true;
  return selected.includes(sheetName);
}

function onToggleDiceSheetVisibility(sheetName: string, event: Event): void {
  const target = event?.target as HTMLInputElement | null;
  const checked = !!target?.checked;
  const options = diceReferenceSheetOptions.value;
  const current = getDiceReferenceSelectedSheets();
  let next = current.length === 0 ? [...options] : [...current];

  if (checked) {
    if (!next.includes(sheetName)) {
      next.push(sheetName);
    }
  } else {
    next = next.filter(name => name !== sheetName);
  }

  // 空数组表示“全部可见”
  if (options.length > 0 && next.length === options.length) {
    next = [];
  }
  setDiceReferenceSelectedSheets(next);
}

const diceReferenceSheetSummary = computed(() => {
  const optionsCount = diceReferenceSheetOptions.value.length;
  const selected = getDiceReferenceSelectedSheets();
  if (optionsCount <= 0) {
    return '暂无可用表名。';
  }
  if (selected.length === 0) {
    return `当前：全部可见（${optionsCount}/${optionsCount}）`;
  }
  return `当前：已勾选 ${selected.length}/${optionsCount}`;
});

function refreshDiceReferenceSheetOptions(): void {
  refreshingDiceSheetOptions.value = true;
  try {
    const fromApi = readDiceReferenceSheetNamesFromApi();
    const fromChat = fromApi.length > 0 ? [] : readDiceReferenceSheetNamesFromChat();
    const selected = getDiceReferenceSelectedSheets();
    diceReferenceSheetOptions.value = dedupeDiceReferenceSheetNames([
      ...fromApi,
      ...fromChat,
      ...selected,
    ]);
  } finally {
    refreshingDiceSheetOptions.value = false;
  }
}

function selectAllDiceReferenceSheets(): void {
  // 空数组表示“全部可见”
  setDiceReferenceSelectedSheets([]);
}

function clearDiceReferenceSheets(): void {
  // 空数组表示“全部可见”
  setDiceReferenceSelectedSheets([]);
}

const ttsEnabled = ref(getTTSEnabled());
const ttsVoiceList = ref<TTSSpeakerVoice[]>([]);
const refreshingTtsVoices = ref(false);
const gptSoVitsModelsJson = ref('');
const gptSoVitsVoicesJson = ref('');
const ttsTestText = ref('你好，这是一段 TTS 配音测试。');
const gptModelImportJsonInputRef = ref<HTMLInputElement | null>(null);
const gptModelImportFolderInputRef = ref<HTMLInputElement | null>(null);
const gptImportJsonInputRef = ref<HTMLInputElement | null>(null);
const gptImportFolderInputRef = ref<HTMLInputElement | null>(null);
const showGptModelManager = ref(false);
const showGptModelEditor = ref(false);
const gptModelManagerSearch = ref('');
const gptModelManagerModels = ref<GptSoVitsModelStoreConfig[]>([]);
const gptModelManagerImportJsonInputRef = ref<HTMLInputElement | null>(null);
const gptModelManagerImportFolderInputRef = ref<HTMLInputElement | null>(null);
const gptModelEditor = ref<GptSoVitsModelStoreConfig | null>(null);
const gptModelEditorModelId = ref('');
const gptModelEditorExpressionRows = ref<Array<{ expression: string; refId: string }>>([]);

const isGptSetModelMode = computed(
  () => normalizeGptSoVitsSwitchMode(settings.value.gptSoVits?.modelSwitchMode) === 'set_model',
);

const ttsVoiceHint = computed(() => {
  const providerHint =
    settings.value.ttsProvider === TTS_PROVIDER.GPT_SOVITS_V2
      ? 'GPT-SoVITS：建议把音色 name 设为角色名。'
      : settings.value.ttsProvider === TTS_PROVIDER.EDGE_TTS_DIRECT
        ? 'EdgeTTS（直连）：前端直连，不需要插件；失败时可切换 Edge 浏览器复测。'
        : 'LittleWhiteBox：未指定/未绑定时使用此默认音色。';
  const emptyHint = ttsVoiceList.value.length === 0 ? '（当前音色列表为空）' : '';
  return `${providerHint}${emptyHint}`;
});

const gptModelSummaryHint = computed(() => {
  const models = Array.isArray(settings.value.gptSoVits?.models) ? settings.value.gptSoVits.models : [];
  const enabledCount = models.filter((item: any) => item?.enabled !== false).length;
  const refCount = models.reduce((sum: number, item: any) => {
    const refs = Array.isArray(item?.refAudios) ? item.refAudios.length : 0;
    return sum + refs;
  }, 0);
  const defaultSpeaker = String(settings.value.ttsDefaultSpeaker || '').trim() || '未设置';
  return `模型 ${models.length} 条（启用 ${enabledCount} 条），参考音频 ${refCount} 条，默认音色：${defaultSpeaker}`;
});

const filteredGptModelManagerModels = computed(() => {
  const list = Array.isArray(gptModelManagerModels.value) ? gptModelManagerModels.value : [];
  const keyword = String(gptModelManagerSearch.value || '').trim().toLowerCase();
  if (!keyword) return list;
  return list.filter(model => {
    const text = [
      String(model?.name || ''),
      String(model?.desc || ''),
      String(model?.id || ''),
      String(model?.paths?.gptWeightsPath || ''),
      String(model?.paths?.sovitsWeightsPath || ''),
    ]
      .join(' ')
      .toLowerCase();
    return text.includes(keyword);
  });
});

const emotionTags = EMOTION_TAGS;
const live2dExpressions = ref<string[]>([]);
const live2dMotionGroups = ref<Array<{ name: string; count: number }>>([]);
const live2dMotions = ref<Array<{ name: string; group: string; index: number }>>([]);
const refreshingLive2dLists = ref(false);

const live2dExpressionOptions = computed(() => {
  const dedup = new Set<string>();
  const list: string[] = [];
  for (const item of live2dExpressions.value) {
    const value = String(item ?? '').trim();
    if (!value) continue;
    if (dedup.has(value)) continue;
    dedup.add(value);
    list.push(value);
  }
  return list.sort((a, b) => a.localeCompare(b));
});

const live2dExpressionOptionSet = computed(() => {
  return new Set(live2dExpressionOptions.value);
});

type MotionOverridePayload = {
  group: string;
  index: number;
  name?: string;
  explicitEmptyGroup?: boolean;
};

type MotionSelectOption = {
  key: string;
  value: string;
  label: string;
};

function normalizeMotionIndex(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function normalizeMotionGroupValue(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (raw === EMPTY_MOTION_GROUP_VALUE) return '';
  return raw;
}

function isEmptyMotionGroupMarker(value: unknown): boolean {
  return String(value ?? '').trim() === EMPTY_MOTION_GROUP_VALUE;
}

function normalizeMotionOverridePayload(payload: MotionOverridePayload): MotionOverridePayload {
  const explicitEmptyGroup = payload.explicitEmptyGroup === true || isEmptyMotionGroupMarker(payload.group);
  return {
    group: normalizeMotionGroupValue(payload.group),
    index: normalizeMotionIndex(payload.index),
    name: String(payload.name ?? '').trim(),
    explicitEmptyGroup,
  };
}

function encodeMotionOption(payload: MotionOverridePayload): string {
  const normalized = normalizeMotionOverridePayload(payload);
  const hasExplicitEmpty = normalized.explicitEmptyGroup === true && normalized.group === '';
  if (!normalized.group && normalized.index === 0 && !hasExplicitEmpty) return '';
  return JSON.stringify({
    ...normalized,
    group: normalized.group === '' && hasExplicitEmpty ? EMPTY_MOTION_GROUP_VALUE : normalized.group,
  });
}

function decodeMotionOption(raw: string): MotionOverridePayload | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<MotionOverridePayload>;
    if (!parsed || typeof parsed !== 'object') return null;
    const explicitEmptyGroup = isEmptyMotionGroupMarker((parsed as any).group);
    const group = normalizeMotionGroupValue(parsed.group ?? '');
    const index = normalizeMotionIndex(parsed.index);
    if (!group && index === 0 && !explicitEmptyGroup) return null;
    return {
      group,
      index,
      name: String(parsed.name ?? '').trim(),
      explicitEmptyGroup,
    };
  } catch {
    return null;
  }
}

function resolveMotionOverridePayload(cfg: EmotionConfig): MotionOverridePayload | null {
  const rawGroup = String(cfg?.live2dMotion?.group ?? '');
  const explicitEmptyGroup = isEmptyMotionGroupMarker(rawGroup);
  const overrideGroup = normalizeMotionGroupValue(rawGroup);
  const overrideIndex = normalizeMotionIndex(cfg?.live2dMotion?.index);
  const hasExplicitOverride = explicitEmptyGroup || !!overrideGroup || overrideIndex > 0;
  if (!hasExplicitOverride) return null;

  const exactByGroupIndex = live2dMotions.value.find((motion) => {
    const group = normalizeMotionGroupValue(motion?.group);
    const index = normalizeMotionIndex(motion?.index);
    return group === overrideGroup && index === overrideIndex;
  });
  if (exactByGroupIndex) {
    return normalizeMotionOverridePayload({
      group: exactByGroupIndex.group,
      index: exactByGroupIndex.index,
      name: exactByGroupIndex.name,
    });
  }

  // 兼容旧配置：group 字段历史上可能被写成 motion name。
  const lower = overrideGroup.toLowerCase();
  if (lower) {
    const byName =
      live2dMotions.value.find((motion) => {
        const name = String(motion?.name ?? '').trim().toLowerCase();
        const index = normalizeMotionIndex(motion?.index);
        return name === lower && index === overrideIndex;
      }) ||
      live2dMotions.value.find((motion) => String(motion?.name ?? '').trim().toLowerCase() === lower);
    if (byName) {
      return normalizeMotionOverridePayload({
        group: byName.group,
        index: byName.index,
        name: byName.name,
      });
    }
  }

  return normalizeMotionOverridePayload({
    group: overrideGroup,
    index: overrideIndex,
    explicitEmptyGroup,
  });
}

function getMotionOverrideValue(cfg: EmotionConfig): string {
  const payload = resolveMotionOverridePayload(cfg);
  if (!payload) return '';
  return encodeMotionOption(payload);
}

function getMotionOverrideLabel(cfg: EmotionConfig): string {
  const payload = resolveMotionOverridePayload(cfg);
  if (!payload) return '';
  if (payload.name) {
    const groupLabel = payload.group ? `${payload.group}#${payload.index}` : `#${payload.index}`;
    return `${payload.name}（动作 ${groupLabel}）`;
  }
  return `${payload.group || '(空动作组)'}#${payload.index}`;
}

function setMotionOverrideValue(cfg: EmotionConfig, rawValue: unknown): void {
  const parsed = decodeMotionOption(String(rawValue || '').trim());
  if (!parsed) {
    cfg.live2dMotion.group = '';
    cfg.live2dMotion.index = 0;
    return;
  }
  cfg.live2dMotion.group =
    parsed.group === '' && parsed.explicitEmptyGroup === true ? EMPTY_MOTION_GROUP_VALUE : parsed.group;
  cfg.live2dMotion.index = parsed.index;
}

function onMotionOverrideChange(cfg: EmotionConfig, event: Event): void {
  const target = event?.target as HTMLSelectElement | null;
  setMotionOverrideValue(cfg, target?.value || '');
}

const live2dMotionSelectOptions = computed<Array<MotionSelectOption>>(() => {
  const seen = new Set<string>();
  const options: MotionSelectOption[] = [];

  for (const motion of live2dMotions.value) {
    const group = normalizeMotionGroupValue(motion?.group);
    const index = normalizeMotionIndex(motion?.index);
    const name = String(motion?.name ?? '').trim();
    const value = encodeMotionOption({ group, index, name, explicitEmptyGroup: group === '' });
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const groupLabel = `${group || '(空动作组)'}#${index}`;
    const safeName = name || '(未命名动作)';
    options.push({
      key: `motion_${groupLabel}_${safeName}`.replace(/\s+/g, '_'),
      value,
      label: `${safeName}（动作 ${groupLabel}）`,
    });
  }

  for (const group of live2dMotionGroups.value) {
    const groupName = normalizeMotionGroupValue(group?.name);
    const value = encodeMotionOption({
      group: groupName,
      index: 0,
      explicitEmptyGroup: groupName === '',
    });
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const groupLabel = groupName || '(空动作组)';
    options.push({
      key: `group_${groupLabel}_${group.count}`.replace(/\s+/g, '_'),
      value,
      label: `${groupLabel}（动作组 ${group.count}）`,
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'));
});

const live2dMotionOptionSet = computed(() => {
  return new Set(live2dMotionSelectOptions.value.map(option => option.value));
});

const live2dListSummary = computed(() => {
  const exprCount = live2dExpressions.value.length;
  const motionCount = live2dMotions.value.length;
  const groupCount = live2dMotionGroups.value.length;
  if (!Live2DManager.model) return '当前未加载 Live2D 模型，加载后可刷新列表。';
  const exprHint = exprCount === 0 ? '（该模型可能未提供独立 Expressions）' : '';
  const motionHint = motionCount === 0 ? '（未识别到 motions）' : '';
  return `当前模型：表情 ${exprCount} 个${exprHint}，动作 ${motionCount} 个${motionHint}，动作组 ${groupCount} 个。`;
});

const live2dPreviewMountEl = ref<HTMLElement | null>(null);
const live2dPreviewInteractEl = ref<HTMLElement | null>(null);
const previewMounted = ref(false);
const previewTag = ref<EmotionTag>('默认');
const previewStatus = ref('切换到“表情”后自动加载预览');
const previewZoomFactor = ref(1.8);
let previewPanOffsetX = 0;
let previewPanOffsetY = 0;
let previewBasePose = { x: 0, y: 0, scale: 1 };
let previewIsDragging = false;
let previewDragStart = { x: 0, y: 0 };
let previewDragOrigin = { x: 0, y: 0 };
let previewMountPromise: Promise<boolean> | null = null;
let previewResizeObserver: ResizeObserver | null = null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getPreviewCanvasSize(): { width: number; height: number } {
  const el = live2dPreviewMountEl.value;
  const rect = el?.getBoundingClientRect?.();
  const width = Math.max(1, Math.floor(rect?.width || el?.clientWidth || 320));
  const height = Math.max(1, Math.floor(rect?.height || el?.clientHeight || 260));
  return { width, height };
}

function capturePreviewBasePose(): void {
  const model = Live2DManager.model as any;
  if (!model) return;

  const baseScale = Number(model.scale?.x);
  previewBasePose = {
    x: Number(model.x) || 0,
    y: Number(model.y) || 0,
    scale: Number.isFinite(baseScale) && baseScale > 0 ? baseScale : 1,
  };
}

function applyPreviewViewport(): void {
  if (!previewMounted.value) return;
  const model = Live2DManager.model as any;
  if (!model) return;

  const { width, height } = getPreviewCanvasSize();
  const maxOffsetX = Math.max(60, width * 0.45);
  const maxOffsetY = Math.max(60, height * 0.45);
  previewPanOffsetX = clamp(previewPanOffsetX, -maxOffsetX, maxOffsetX);
  previewPanOffsetY = clamp(previewPanOffsetY, -maxOffsetY, maxOffsetY);
  previewZoomFactor.value = clamp(previewZoomFactor.value, 0.5, 4);

  const finalScale = previewBasePose.scale * previewZoomFactor.value;
  if (model.scale?.set) {
    model.scale.set(finalScale);
  }
  model.x = previewBasePose.x + previewPanOffsetX;
  model.y = previewBasePose.y + previewPanOffsetY;

  try {
    const app = (Live2DStage as any).app;
    if (app?.renderer && app?.stage) {
      app.renderer.render(app.stage);
    }
  } catch {
    // ignore
  }
}

function resetPreviewViewport(): void {
  previewZoomFactor.value = 1.8;
  previewPanOffsetX = 0;
  previewPanOffsetY = 0;
  applyPreviewViewport();
}

function getPreviewDragPoint(event: unknown): { x: number; y: number } | null {
  const ev: any = (event as any)?.originalEvent || event;
  if (ev?.touches?.length) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  if (ev?.changedTouches?.length) return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
  if (Number.isFinite(ev?.clientX) && Number.isFinite(ev?.clientY)) return { x: ev.clientX, y: ev.clientY };
  return null;
}

function unbindPreviewViewportEvents(): void {
  const interactEl = live2dPreviewInteractEl.value;
  if (!interactEl) return;
  const top = window.parent ?? window;
  const doc = top.document;

  const handlers = (interactEl as any).__dpPreviewHandlers;
  if (!handlers) return;

  try {
    interactEl.removeEventListener('mousedown', handlers.onDown);
    interactEl.removeEventListener('touchstart', handlers.onDown);
    interactEl.removeEventListener('wheel', handlers.onWheel);
    doc.removeEventListener('mousemove', handlers.onMove);
    doc.removeEventListener('touchmove', handlers.onMove);
    doc.removeEventListener('mouseup', handlers.onUp);
    doc.removeEventListener('touchend', handlers.onUp);
    doc.removeEventListener('touchcancel', handlers.onUp);
  } catch {
    // ignore
  }

  (interactEl as any).__dpPreviewHandlers = null;
}

function bindPreviewViewportEvents(): void {
  const interactEl = live2dPreviewInteractEl.value;
  if (!interactEl) return;
  if ((interactEl as any).__dpPreviewHandlers) return;

  const top = window.parent ?? window;
  const doc = top.document;

  const onDown = (event: any) => {
    if (!previewMounted.value) return;
    const point = getPreviewDragPoint(event);
    if (!point) return;
    previewIsDragging = true;
    previewDragStart = point;
    previewDragOrigin = { x: previewPanOffsetX, y: previewPanOffsetY };
    interactEl.style.cursor = 'grabbing';
    if (typeof event.preventDefault === 'function') event.preventDefault();
  };

  const onMove = (event: any) => {
    if (!previewIsDragging) return;
    const point = getPreviewDragPoint(event);
    if (!point) return;
    previewPanOffsetX = previewDragOrigin.x + (point.x - previewDragStart.x);
    previewPanOffsetY = previewDragOrigin.y + (point.y - previewDragStart.y);
    applyPreviewViewport();
    if (typeof event.preventDefault === 'function') event.preventDefault();
  };

  const onUp = () => {
    if (!previewIsDragging) return;
    previewIsDragging = false;
    interactEl.style.cursor = 'grab';
  };

  const onWheel = (event: WheelEvent) => {
    if (!previewMounted.value) return;
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    previewZoomFactor.value = clamp(previewZoomFactor.value + delta, 0.5, 4);
    applyPreviewViewport();
  };

  interactEl.style.cursor = 'grab';
  interactEl.addEventListener('mousedown', onDown);
  interactEl.addEventListener('touchstart', onDown, { passive: false });
  interactEl.addEventListener('wheel', onWheel, { passive: false });
  doc.addEventListener('mousemove', onMove);
  doc.addEventListener('touchmove', onMove, { passive: false });
  doc.addEventListener('mouseup', onUp);
  doc.addEventListener('touchend', onUp);
  doc.addEventListener('touchcancel', onUp);

  (interactEl as any).__dpPreviewHandlers = { onDown, onMove, onUp, onWheel };
}

function disconnectPreviewResizeObserver(): void {
  try {
    previewResizeObserver?.disconnect();
  } catch {
    // ignore
  } finally {
    previewResizeObserver = null;
  }
}

function bindPreviewResizeObserver(): void {
  const mountEl = live2dPreviewMountEl.value;
  if (!mountEl) return;
  disconnectPreviewResizeObserver();
  if (typeof ResizeObserver === 'undefined') return;

  try {
    previewResizeObserver = new ResizeObserver(() => {
      if (!previewMounted.value) return;
      const { width, height } = getPreviewCanvasSize();
      Live2DStage.resizePreview(width, height);
      applyPreviewViewport();
    });
    previewResizeObserver.observe(mountEl);
  } catch {
    previewResizeObserver = null;
  }
}

async function ensurePreviewMounted(): Promise<boolean> {
  if (previewMounted.value) return true;
  if (previewMountPromise) return previewMountPromise;

  previewMountPromise = (async () => {
    await nextTick();
    const mountEl = live2dPreviewMountEl.value;
    if (!mountEl) return false;
    if (!Live2DManager.model) {
      previewStatus.value = '当前未加载 Live2D 模型';
      return false;
    }
    if (!Live2DStage.container) {
      previewStatus.value = 'Live2D 舞台未就绪';
      return false;
    }

    previewStatus.value = '正在挂载预览...';
    const attached = Live2DStage.pushMount(mountEl);
    if (!attached) {
      previewStatus.value = '预览挂载失败';
      return false;
    }

    previewMounted.value = true;
    bindPreviewViewportEvents();
    bindPreviewResizeObserver();

    const { width, height } = getPreviewCanvasSize();
    Live2DStage.resizePreview(width, height);
    Live2DManager.mountToStage(width, height, 1);
    capturePreviewBasePose();
    resetPreviewViewport();

    // 自动刷新一次列表，方便快速绑定
    refreshLive2DLists();

    previewStatus.value = '预览就绪，可拖拽移动/滚轮缩放';
    return true;
  })().finally(() => {
    previewMountPromise = null;
  });

  return previewMountPromise;
}

function cleanupPreviewMount(): void {
  disconnectPreviewResizeObserver();
  unbindPreviewViewportEvents();
  previewIsDragging = false;

  if (!previewMounted.value) return;
  previewMounted.value = false;

  const restored = Live2DStage.popMount();
  if (restored && Live2DManager.model) {
    Live2DManager.mountToStage(restored.width, restored.height, 1);
  }
  previewStatus.value = '切换到“表情”后自动加载预览';
}

function replayPreview(): void {
  void previewEmotion(previewTag.value);
}

watch(
  () => ({ visible: props.visible, section: activeSection.value }),
  ({ visible, section }) => {
    if (visible && section === 'expression') {
      void (async () => {
        const mounted = await ensurePreviewMounted();
        if (mounted) {
          void previewEmotion(previewTag.value);
        }
      })();
      return;
    }
    cleanupPreviewMount();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  cleanupPreviewMount();
});

const modelList = ref<string[]>([]);
const fetchingModels = ref(false);
const modelFetchError = ref('');
const testingConnection = ref(false);
const connectionStatus = ref<'idle' | 'success' | 'fail'>('idle');
const connectionError = ref('');
const showAdvanced = ref(false);
const showEmotionAdvanced = ref(false);
const showLipSyncAdvanced = ref(false);
const lipSyncManualParamsText = ref('');
const overlayFallbackStyle = {
  position: 'fixed',
  inset: '0',
  width: '100vw',
  height: '100vh',
  minHeight: '100vh',
  zIndex: '10001',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
const panelFallbackStyle = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  width: 'min(1080px, calc(100vw - 24px))',
  maxHeight: 'calc(100vh - 24px)',
  minHeight: '280px',
};

type CustomApiModelConfig = {
  apiurl: string;
  key?: string;
};

function normalizeModelList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) out.push(trimmed);
      continue;
    }
    if (item && typeof item === 'object') {
      const maybeId = (item as { id?: unknown; model?: unknown; name?: unknown }).id;
      const maybeModel = (item as { id?: unknown; model?: unknown; name?: unknown }).model;
      const maybeName = (item as { id?: unknown; model?: unknown; name?: unknown }).name;
      const picked =
        typeof maybeId === 'string'
          ? maybeId
          : typeof maybeModel === 'string'
            ? maybeModel
            : typeof maybeName === 'string'
              ? maybeName
              : '';
      const trimmed = picked.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return [...new Set(out)];
}

async function getModelListByHttp(customApi: CustomApiModelConfig): Promise<string[]> {
  const base = String(customApi.apiurl || '')
    .trim()
    .replace(/\/+$/, '');
  if (!base) throw new Error('API URL 为空');

  const headers: HeadersInit = { Accept: 'application/json' };
  if (customApi.key) headers.Authorization = `Bearer ${customApi.key}`;

  const request = async (path: string) =>
    fetch(`${base}${path}`, {
      method: 'GET',
      headers,
      cache: 'no-cache',
    });

  let response = await request('/v1/models');
  if (!response.ok && (response.status === 404 || response.status === 405)) {
    response = await request('/models');
  }

  if (!response.ok) {
    throw new Error(`模型列表请求失败 (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as { data?: unknown; models?: unknown };
  return normalizeModelList(payload.data ?? payload.models ?? payload);
}

async function getModelListSafe(customApi: CustomApiModelConfig): Promise<string[]> {
  const helperGetModelList = (window as any)?.TavernHelper?.getModelList as
    | ((config: CustomApiModelConfig) => Promise<unknown>)
    | undefined;

  if (typeof helperGetModelList === 'function') {
    try {
      const models = await helperGetModelList(customApi);
      const normalized = normalizeModelList(models);
      if (normalized.length > 0) return normalized;
    } catch (e) {
      console.warn(`[${SCRIPT_NAME}] TavernHelper.getModelList 调用失败，改用 HTTP 回退`, e);
    }
  }

  if (typeof getModelList === 'function') {
    try {
      const models = await getModelList(customApi);
      const normalized = normalizeModelList(models);
      if (normalized.length > 0) return normalized;
    } catch (e) {
      console.warn(`[${SCRIPT_NAME}] getModelList 调用失败，改用 HTTP 回退`, e);
    }
  }

  return getModelListByHttp(customApi);
}

async function fetchModels() {
  const url = settings.value.apiConfig.url;
  if (!url) return;

  fetchingModels.value = true;
  modelFetchError.value = '';
  modelList.value = [];

  try {
    const models = await getModelListSafe({
      apiurl: url,
      key: settings.value.apiConfig.apiKey || undefined,
    });
    modelList.value = models;
    if (models.length > 0 && !models.includes(settings.value.apiConfig.model)) {
      settings.value.apiConfig.model = models[0];
    }
  } catch (e: unknown) {
    modelFetchError.value = `获取失败: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    fetchingModels.value = false;
  }
}

async function testConnection() {
  const url = settings.value.apiConfig.url;
  if (!url) return;

  testingConnection.value = true;
  connectionStatus.value = 'idle';
  connectionError.value = '';

  try {
    const models = await getModelListSafe({
      apiurl: url,
      key: settings.value.apiConfig.apiKey || undefined,
    });
    if (models && models.length >= 0) {
      connectionStatus.value = 'success';
    } else {
      connectionStatus.value = 'fail';
      connectionError.value = '返回数据异常';
    }
  } catch (e: unknown) {
    connectionStatus.value = 'fail';
    connectionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    testingConnection.value = false;
  }
}

function formatFileSize(fileSize: unknown): string {
  const bytes = Number(fileSize || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatLocalUploadTime(timestamp: unknown): string {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) return '未知';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '未知';
  }
}

function runtimeLabel(runtimeType: unknown): string {
  const runtime = String(runtimeType || '').trim().toLowerCase() as Live2DRuntimeType;
  if (runtime === 'cubism5') return 'cubism5';
  return 'legacy';
}

async function refreshLocalModelInfo(): Promise<void> {
  try {
    const model = await getLive2DModel(LOCAL_LIVE2D_MODEL_SLOT_ID);
    localModelInfo.value = model;
    if (!model && settings.value.modelPath === LOCAL_LIVE2D_MODEL_PATH) {
      localModelStatus.value = '当前本地槽位为空，请先上传 ZIP 模型。';
    } else if (model) {
      localModelStatus.value = `本地模型槽位就绪：${model.fileName}`;
    }
  } catch (e) {
    localModelInfo.value = null;
    localModelError.value = `读取本地模型失败: ${e instanceof Error ? e.message : String(e)}`;
  }
}

function triggerLocalModelUpload(): void {
  localModelError.value = '';
  localModelStatus.value = '';
  const inputEl = localModelFileInput.value;
  if (!inputEl) return;
  inputEl.value = '';
  inputEl.click();
}

async function onLocalModelFileChange(event: Event): Promise<void> {
  const inputEl = event.target as HTMLInputElement | null;
  const file = inputEl?.files?.[0];
  if (!file) return;

  uploadingLocalModel.value = true;
  localModelError.value = '';
  localModelStatus.value = `正在解析 ${file.name}...`;

  try {
    const storedModel = await Live2DUploader.uploadZip(file);
    localModelStatus.value = `上传成功：${storedModel.fileName}`;
    await refreshLocalModelInfo();
    settings.value.modelPath = LOCAL_LIVE2D_MODEL_PATH;
    customModelUrl.value = LOCAL_LIVE2D_MODEL_PATH;
    emit('model-change', LOCAL_LIVE2D_MODEL_PATH);
    toastr.success('本地模型上传成功，已切换到本地模型');
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    localModelError.value = `上传失败：${message}`;
    localModelStatus.value = '';
    toastr.error(`本地模型上传失败：${message}`);
  } finally {
    uploadingLocalModel.value = false;
    if (inputEl) inputEl.value = '';
  }
}

async function useUploadedModel(): Promise<void> {
  localModelActionBusy.value = true;
  localModelError.value = '';
  try {
    const exists = await hasLive2DModel(LOCAL_LIVE2D_MODEL_SLOT_ID);
    if (!exists) {
      localModelStatus.value = '当前没有可用的本地模型，请先上传 ZIP。';
      toastr.warning('当前没有可用的本地模型，请先上传 ZIP');
      return;
    }
    await refreshLocalModelInfo();
    settings.value.modelPath = LOCAL_LIVE2D_MODEL_PATH;
    customModelUrl.value = LOCAL_LIVE2D_MODEL_PATH;
    localModelStatus.value = '已切换到本地模型。';
    emit('model-change', LOCAL_LIVE2D_MODEL_PATH);
  } catch (e) {
    localModelError.value = `切换本地模型失败: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    localModelActionBusy.value = false;
  }
}

async function clearUploadedModel(): Promise<void> {
  localModelActionBusy.value = true;
  localModelError.value = '';
  try {
    await deleteLive2DModel(LOCAL_LIVE2D_MODEL_SLOT_ID);
    localModelInfo.value = null;
    localModelStatus.value = '已清除本地模型槽位。';

    if (settings.value.modelPath === LOCAL_LIVE2D_MODEL_PATH) {
      settings.value.modelPath = DEFAULTS.MODEL_PATH;
      customModelUrl.value = DEFAULTS.MODEL_PATH;
      emit('model-change', DEFAULTS.MODEL_PATH);
    }
    toastr.success('已清除本地模型');
  } catch (e) {
    localModelError.value = `清除失败: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    localModelActionBusy.value = false;
  }
}

function selectModel(path: string) {
  settings.value.modelPath = path;
  customModelUrl.value = path;
  emit('model-change', path);
}

function onBrowserLoad(url: string) {
  settings.value.modelPath = url;
  customModelUrl.value = url;
  showBrowser.value = false;
  emit('model-change', url);
}

function loadCustomUrl() {
  let url = customModelUrl.value.trim();
  if (!url) return;
  const blobMatch = url.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/(.+)$/);
  if (blobMatch) {
    url = `https://raw.githubusercontent.com/${blobMatch[1]}/${blobMatch[2]}`;
    customModelUrl.value = url;
  }
  settings.value.modelPath = url;
  emit('model-change', url);
}

function resetSettings() {
  store.resetSettings();
}

function resetEmotionConfigs(): void {
  settings.value.emotionConfigs = createDefaultEmotionConfigs() as any;
  try {
    toastr.success('表情配置已重置为默认');
  } catch {
    // ignore
  }
}

function onAliasesBlur(cfg: EmotionConfig, ev: Event): void {
  const input = ev.target as HTMLInputElement | null;
  if (!input) return;
  cfg.aliases = parseAliasesText(input.value) as any;
}

function refreshLive2DLists(): void {
  refreshingLive2dLists.value = true;
  try {
    live2dExpressions.value = Live2DManager.getExpressions();
    live2dMotions.value = Live2DManager.getMotions()
      .map(m => ({ name: m.name, group: m.group, index: m.index }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const groups = Live2DManager.getMotionGroups();
    live2dMotionGroups.value = Object.entries(groups)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));

    try {
      toastr.info('已刷新模型表情/动作列表');
    } catch {
      // ignore
    }
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] 刷新模型表情/动作列表失败:`, e);
    live2dExpressions.value = [];
    live2dMotions.value = [];
    live2dMotionGroups.value = [];
    try {
      toastr.error('刷新列表失败，请先确保模型已加载');
    } catch {
      // ignore
    }
  } finally {
    refreshingLive2dLists.value = false;
  }
}

function autoMatchLive2DOverrides(overwrite = false): void {
  const model = Live2DManager.model as any;
  if (!model) {
    try {
      toastr.warning('当前未加载模型，无法自动匹配');
    } catch {
      // ignore
    }
    return;
  }

  let filled = 0;
  for (const cfg of settings.value.emotionConfigs as any as EmotionConfig[]) {
    const exprOverride = String(cfg.live2dExpression || '').trim();
    if (overwrite || !exprOverride) {
      const matched = matchLive2DExpression(model, cfg.tag);
      if (matched) {
        cfg.live2dExpression = matched;
        filled += 1;
      }
    }

    const motionEnabled = cfg.live2dMotion?.enabled !== false;
    const motionGroupOverride = String(cfg.live2dMotion?.group || '').trim();
    if (motionEnabled && (overwrite || !motionGroupOverride)) {
      const matchedMotion = matchLive2DMotion(model, cfg.tag);
      if (matchedMotion) {
        cfg.live2dMotion.group = matchedMotion.group;
        cfg.live2dMotion.index = matchedMotion.index;
        filled += 1;
      }
    }
  }

  try {
    if (overwrite) {
      toastr.success(filled > 0 ? `已自动匹配并覆盖 ${filled} 项` : '未找到可覆盖的匹配结果');
    } else {
      toastr.success(filled > 0 ? `已自动匹配并填充 ${filled} 项空白覆盖` : '未找到可填充的空白覆盖');
    }
  } catch {
    // ignore
  }
}

function clearLive2DOverrides(): void {
  let cleared = 0;
  for (const cfg of settings.value.emotionConfigs as any as EmotionConfig[]) {
    const hadExpr = !!String(cfg.live2dExpression || '').trim();
    const hadGroup = !!String(cfg.live2dMotion?.group || '').trim();

    if (hadExpr) {
      cfg.live2dExpression = '';
      cleared += 1;
    }
    if (hadGroup) {
      cfg.live2dMotion.group = '';
      cfg.live2dMotion.index = 0;
      cleared += 1;
    }
  }

  try {
    toastr.info(cleared > 0 ? `已清空 ${cleared} 项 Live2D 覆盖` : '当前没有需要清空的 Live2D 覆盖');
  } catch {
    // ignore
  }
}

async function previewEmotion(tag: EmotionTag): Promise<void> {
  previewTag.value = tag;

  const mounted = await ensurePreviewMounted();
  if (!mounted) return;

  const model = Live2DManager.model as any;
  if (!model) {
    previewStatus.value = '模型未就绪';
    return;
  }

  applyPreviewViewport();

  const cfg = (settings.value.emotionConfigs as any as EmotionConfig[]).find(c => c.tag === tag);
  const expr = matchLive2DExpression(model, tag, cfg?.live2dExpression);
  if (expr) {
    Live2DManager.playExpression(expr);
  }

  const motion = matchLive2DMotion(model, tag, cfg?.live2dMotion);
  if (motion) {
    Live2DManager.playMotion(motion.group, motion.index);
  }

  const exprText = expr ? `表情: ${expr}` : '表情: (无匹配)';
  const motionText = motion
    ? motion.name
      ? `动作: ${motion.name} (${motion.group || '(空动作组)'}#${motion.index})`
      : `动作: ${motion.group || '(空动作组)'}`
    : '动作: (无匹配)';
  previewStatus.value = `${tag} | ${exprText} | ${motionText}`;

  if (!expr && !motion) {
    try {
      toastr.info('未匹配到可用的表情/动作（可尝试刷新列表或手动覆盖）');
    } catch {
      // ignore
    }
  }
}

function onToggleTtsEnabled() {
  setTTSEnabled(ttsEnabled.value);
  if (!ttsEnabled.value) {
    try {
      TTSManager.stop();
    } catch {
      // ignore
    }
  }
}

async function refreshTtsVoices() {
  refreshingTtsVoices.value = true;
  try {
    ttsVoiceList.value = await getTTSVoiceListAsync();
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] 获取 TTS 音色列表失败:`, e);
    ttsVoiceList.value = [];
  } finally {
    refreshingTtsVoices.value = false;
  }
}

function normalizePathSepLocal(input: unknown): string {
  return String(input || '').replace(/\\/g, '/').trim();
}

function normalizeImportRootPathLocal(input: unknown): string {
  let normalized = normalizePathSepLocal(input).replace(/[\\/]+$/g, '');
  if (/^[a-zA-Z]:$/.test(normalized)) normalized = `${normalized}/`;
  return normalized;
}

function getRelativeRootNameFromFiles(fileList: ArrayLike<File> | File[]): string {
  const files = Array.from(fileList || []);
  for (const file of files) {
    const rel = String((file as any)?.webkitRelativePath || '').trim().replace(/\\/g, '/');
    const first = String(rel.split('/')[0] || '').trim();
    if (first) return first;
  }
  return '';
}

function syncGptImportPrefix(prefixInput: unknown): string {
  const normalized = normalizeImportRootPathLocal(prefixInput);
  settings.value.gptSoVits.rootDir = normalized;
  settings.value.gptSoVits.importPathPrefix = normalized;
  return normalized;
}

function promptGptImportPrefix(defaultPrefix: unknown): string {
  const initial = normalizeImportRootPathLocal(defaultPrefix);
  const result = window.prompt(
    '请输入导入根路径（绝对路径）。\n例如你选的是 I:/Downloads/GPT-SoVITS v2 pro plus/MyGO!!!!!/高松灯\n可填写 I:/Downloads/GPT-SoVITS v2 pro plus/MyGO!!!!!\n也可填写 I:/Downloads/GPT-SoVITS v2 pro plus/MyGO!!!!!/高松灯（末尾有无 / 或 \\\\ 都可）',
    initial || '',
  );
  return normalizeImportRootPathLocal(String(result || '').trim());
}

function onGptSwitchModeChange(): void {
  settings.value.gptSoVits.modelSwitchMode = normalizeGptSoVitsSwitchMode(settings.value.gptSoVits.modelSwitchMode);
}

function onGptImportPrefixChange(): void {
  syncGptImportPrefix(settings.value.gptSoVits.importPathPrefix);
}

function modelToLegacyVoice(model: any): any | null {
  if (!model) return null;
  const refs = Array.isArray(model.refAudios) ? model.refAudios : [];
  const defRef =
    refs.find(item => String(item?.id || '').trim() === String(model.defaultRefId || '').trim()) ||
    refs.find(item => String(item?.path || '').trim() === String(model?.paths?.defaultRefAudioPath || '').trim()) ||
    refs[0] ||
    null;
  const params = model?.params || {};
  return {
    name: String(model.name || '').trim(),
    desc: String(model.desc || '').trim(),
    refAudioPath: String(defRef?.path || model?.paths?.defaultRefAudioPath || '').trim(),
    promptText: String(defRef?.promptText || params.promptText || '').trim(),
    promptLang: String(defRef?.promptLang || params.promptLang || 'zh').trim() || 'zh',
    textLang: String(defRef?.textLang || params.textLang || 'auto').trim() || 'auto',
    gptWeightsPath: String(model?.paths?.gptWeightsPath || '').trim(),
    sovitsWeightsPath: String(model?.paths?.sovitsWeightsPath || '').trim(),
    modelSwitchMode: String(params.modelSwitchMode || settings.value.gptSoVits.modelSwitchMode || 'set_weights').trim(),
    setModelEndpoint: String(params.setModelEndpoint || settings.value.gptSoVits.setModelEndpoint || '/set_model').trim(),
    strictWeightSwitch: !!(
      params.strictWeightSwitch ??
      settings.value.gptSoVits.strictWeightSwitch
    ),
  };
}

function syncLegacyVoicesFromModels(models: any[]): any[] {
  return (Array.isArray(models) ? models : [])
    .map(modelToLegacyVoice)
    .filter(Boolean)
    .filter(voice => String((voice as any)?.name || '').trim());
}

function setGptSoVitsModelsTextarea(models: any[]): void {
  try {
    gptSoVitsModelsJson.value = JSON.stringify(models || [], null, 2);
  } catch {
    gptSoVitsModelsJson.value = '[]';
  }
}

function getGptModelsFromTextarea(): GptSoVitsModelStoreConfig[] {
  const raw = gptSoVitsModelsJson.value || '[]';
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('models must be array');
  }
  return normalizeGptSoVitsModelsForStore(parsed);
}

function setGptSoVitsVoicesTextarea(voices: any[]): void {
  try {
    gptSoVitsVoicesJson.value = JSON.stringify(voices || [], null, 2);
  } catch {
    gptSoVitsVoicesJson.value = '[]';
  }
}

function getGptVoicesFromTextarea() {
  const raw = gptSoVitsVoicesJson.value || '[]';
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('voices must be array');
  }
  return normalizeGptSoVitsVoicesForStore(parsed);
}

function mergeGptSoVitsVoicesByName(existing: any[], incoming: any[]): any[] {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const used = new Set(out.map(v => String(v?.name || '').trim()).filter(Boolean));

  for (const voiceRaw of Array.isArray(incoming) ? incoming : []) {
    if (!voiceRaw) continue;
    const voice = { ...voiceRaw };
    const base = String(voice.name || '新音色').trim() || '新音色';
    let name = base;
    let idx = 2;
    while (used.has(name)) {
      name = `${base}_${idx++}`;
    }
    voice.name = name;
    used.add(name);
    out.push(voice);
  }

  return out;
}

function normalizeGptModelMatchKey(value: unknown): string {
  let text = String(value || '').trim();
  if (!text) return '';
  try {
    text = text.normalize('NFKC');
  } catch {
    // ignore
  }
  return text.toLowerCase();
}

function mergeGptSoVitsModelsByName(existing: any[], incoming: any[]): any[] {
  const out = Array.isArray(existing) ? existing.slice() : [];
  const used = new Set(
    out
      .map(v => normalizeGptModelMatchKey(v?.name))
      .filter(Boolean),
  );

  for (const modelRaw of Array.isArray(incoming) ? incoming : []) {
    if (!modelRaw) continue;
    const model = { ...modelRaw };

    const incomingNameKey = normalizeGptModelMatchKey(model?.name);
    const incomingIdKey = normalizeGptModelMatchKey(model?.id);
    const hitIndex = out.findIndex(item => {
      const itemNameKey = normalizeGptModelMatchKey(item?.name);
      const itemIdKey = normalizeGptModelMatchKey(item?.id);
      if (incomingNameKey && incomingNameKey === itemNameKey) return true;
      if (incomingIdKey && incomingIdKey === itemIdKey) return true;
      return false;
    });

    if (hitIndex >= 0) {
      out[hitIndex] = model;
      const nextNameKey = normalizeGptModelMatchKey(model?.name);
      if (nextNameKey) used.add(nextNameKey);
      continue;
    }

    const base = String(model.name || '新模型').trim() || '新模型';
    let name = base;
    let idx = 2;
    while (used.has(normalizeGptModelMatchKey(name))) {
      name = `${base}_${idx++}`;
    }

    model.name = name;
    used.add(normalizeGptModelMatchKey(name));
    out.push(model);
  }

  return out;
}

function deepCloneGptModels(models: GptSoVitsModelStoreConfig[]): GptSoVitsModelStoreConfig[] {
  try {
    return JSON.parse(JSON.stringify(Array.isArray(models) ? models : [])) as GptSoVitsModelStoreConfig[];
  } catch {
    return Array.isArray(models) ? models.slice() : [];
  }
}

function createGptSoVitsModelTemplateConfig(): GptSoVitsModelStoreConfig {
  return {
    id: `model_${Date.now().toString(36)}`,
    name: '新模型',
    enabled: true,
    desc: '手动添加',
    paths: {
      gptWeightsPath: '',
      sovitsWeightsPath: '',
      defaultRefAudioPath: '',
    },
    params: {
      promptText: '',
      promptLang: 'zh',
      textLang: 'zh',
      textSplitMethod: 'cut5',
      speedFactor: 1,
      mediaType: 'wav',
      streamingMode: false,
      modelSwitchMode: normalizeGptSoVitsSwitchMode(settings.value.gptSoVits.modelSwitchMode || 'set_weights'),
      setModelEndpoint: String(settings.value.gptSoVits.setModelEndpoint || '/set_model').trim() || '/set_model',
      strictWeightSwitch: !!settings.value.gptSoVits.strictWeightSwitch,
    },
    refAudios: [],
    defaultRefId: '',
    expressionRefMap: {},
  };
}

function syncGptModelManagerFromSettings(): void {
  const normalized = normalizeGptSoVitsModelsForStore(settings.value.gptSoVits.models || []);
  gptModelManagerModels.value = deepCloneGptModels(normalized);
}

function openGptModelManager(): void {
  syncGptModelManagerFromSettings();
  gptModelManagerSearch.value = '';
  closeGptModelEditor();
  showGptModelManager.value = true;
}

function closeGptModelManager(): void {
  showGptModelManager.value = false;
  closeGptModelEditor();
}

async function applyGptModelManagerModelsToSettings(showSuccessMessage = ''): Promise<void> {
  const normalized = normalizeGptSoVitsModelsForStore(gptModelManagerModels.value || []);
  const legacyVoices = syncLegacyVoicesFromModels(normalized);

  gptModelManagerModels.value = deepCloneGptModels(normalized);
  settings.value.gptSoVits.models = normalized as any;
  settings.value.gptSoVits.voices = legacyVoices as any;
  setGptSoVitsModelsTextarea(normalized as any[]);
  setGptSoVitsVoicesTextarea(legacyVoices as any[]);

  const firstUsable = pickFirstUsableGptSoVitsVoice(getGptSoVitsVoiceList());
  if (!settings.value.ttsDefaultSpeaker && firstUsable?.name) {
    settings.value.ttsDefaultSpeaker = firstUsable.name;
  }

  await refreshTtsVoices();
  if (showSuccessMessage) {
    toastr.success(showSuccessMessage);
  }
}

async function saveGptModelManager(): Promise<void> {
  await applyGptModelManagerModelsToSettings(`GPT-SoVITS 模型列表已保存：${gptModelManagerModels.value.length} 条`);
}

async function saveGptModelManagerAndClose(): Promise<void> {
  await applyGptModelManagerModelsToSettings(`GPT-SoVITS 模型列表已保存：${gptModelManagerModels.value.length} 条`);
  closeGptModelManager();
}

function addGptModelManagerModel(): void {
  const merged = mergeGptSoVitsModelsByName(gptModelManagerModels.value, [createGptSoVitsModelTemplateConfig()]);
  gptModelManagerModels.value = deepCloneGptModels(normalizeGptSoVitsModelsForStore(merged));
  toastr.success('已添加一条模型模板');
}

function getGptModelManagerIndexById(modelId: string): number {
  const targetId = String(modelId || '').trim();
  if (!targetId) return -1;
  return gptModelManagerModels.value.findIndex(item => String(item?.id || '').trim() === targetId);
}

function removeGptModelManagerModel(modelId: string): void {
  const index = getGptModelManagerIndexById(modelId);
  if (index < 0) return;
  gptModelManagerModels.value.splice(index, 1);
  if (gptModelEditorModelId.value === modelId) {
    closeGptModelEditor();
  }
}

function duplicateGptModelManagerModel(modelId: string): void {
  const index = getGptModelManagerIndexById(modelId);
  if (index < 0) return;

  const source = gptModelManagerModels.value[index];
  const cloned = deepCloneGptModels([source])[0] || createGptSoVitsModelTemplateConfig();
  cloned.id = `${String(source?.id || 'model').trim() || 'model'}_${Date.now().toString(36)}`;

  const merged = mergeGptSoVitsModelsByName(gptModelManagerModels.value, [cloned]);
  gptModelManagerModels.value = deepCloneGptModels(normalizeGptSoVitsModelsForStore(merged));
  toastr.success('模型已复制');
}

function setGptModelManagerDefaultSpeaker(model: GptSoVitsModelStoreConfig): void {
  const name = String(model?.name || '').trim();
  if (!name) {
    toastr.error('请先填写模型名称');
    return;
  }
  settings.value.ttsDefaultSpeaker = name;
  toastr.success(`已设默认音色：${name}`);
}

async function testGptModelManagerModel(modelId: string): Promise<void> {
  const index = getGptModelManagerIndexById(modelId);
  if (index < 0) return;
  const model = gptModelManagerModels.value[index];
  const name = String(model?.name || '').trim();
  if (!name) {
    toastr.error('模型名称为空，无法试听');
    return;
  }
  settings.value.ttsDefaultSpeaker = name;
  await applyGptModelManagerModelsToSettings('');
  await testTts();
}

function openGptModelManagerImportJson(): void {
  gptModelManagerImportJsonInputRef.value?.click();
}

function openGptModelManagerImportFolder(): void {
  gptModelManagerImportFolderInputRef.value?.click();
}



async function onGptModelManagerImportJsonChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(String(text || '[]'));
    if (!Array.isArray(parsed)) {
      toastr.error('导入失败：JSON 需为数组');
      return;
    }

    const normalizedIncoming = normalizeGptSoVitsModelsForStore(parsed);
    const merged = mergeGptSoVitsModelsByName(gptModelManagerModels.value, normalizedIncoming);
    gptModelManagerModels.value = deepCloneGptModels(normalizeGptSoVitsModelsForStore(merged));
    toastr.success(`已导入模型：${normalizedIncoming.length} 条（请点击保存）`);
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 模型管理器 JSON 导入失败:`, e);
    toastr.error('导入失败：JSON 解析错误');
  } finally {
    if (input) input.value = '';
  }
}

async function onGptModelManagerImportFolderChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const fileList = input?.files;
  if (!fileList || fileList.length === 0) return;

  try {
    const previousPrefix = normalizeImportRootPathLocal(
      settings.value.gptSoVits.importPathPrefix || settings.value.gptSoVits.rootDir || '',
    );
    const prefix = promptGptImportPrefix(previousPrefix);
    if (!prefix) {
      toastr.info('已取消导入：未填写导入根路径');
      return;
    }
    syncGptImportPrefix(prefix);

    const rootName = getRelativeRootNameFromFiles(Array.from(fileList));
    const inferred = inferGptSoVitsModelsFromFolderFiles(fileList as any, prefix, { relativeRootName: rootName });
    if (!inferred || inferred.length === 0) {
      toastr.warning('未识别到可导入模型（至少需要参考音频）');
      return;
    }

    const merged = mergeGptSoVitsModelsByName(gptModelManagerModels.value, inferred);
    gptModelManagerModels.value = deepCloneGptModels(normalizeGptSoVitsModelsForStore(merged));

    const hasRelativePath = inferred.some(model => {
      const p = String(model?.paths?.defaultRefAudioPath || '').trim();
      return p && !isAbsoluteFileSystemPath(p);
    });
    let msg = `已从文件夹导入模型：${inferred.length} 条（请点击保存）`;
    if (hasRelativePath) {
      msg += '（部分路径仍为相对路径，请检查导入根路径）';
    }
    toastr.success(msg);
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 模型管理器文件夹导入失败:`, e);
    toastr.error('文件夹导入失败');
  } finally {
    if (input) input.value = '';
  }
}

function exportGptModelManagerModels(): void {
  try {
    const normalized = normalizeGptSoVitsModelsForStore(gptModelManagerModels.value || []);
    const blob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gpt_sovits_models.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastr.success('已导出 gpt_sovits_models.json');
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 模型管理器导出失败:`, e);
    toastr.error('导出失败');
  }
}

function normalizeGptModelEditorRefAudio(raw: any, index: number): GptSoVitsRefAudio {
  const id = String(raw?.id || `ref_${index + 1}`).trim() || `ref_${index + 1}`;
  return {
    id,
    name: String(raw?.name || id).trim() || id,
    path: normalizePathSepLocal(raw?.path || ''),
    promptText: String(raw?.promptText || '').trim(),
    promptLang: String(raw?.promptLang || 'zh').trim() || 'zh',
    textLang: String(raw?.textLang || 'auto').trim() || 'auto',
  };
}

function ensureGptModelEditorStructure(): void {
  const model = gptModelEditor.value;
  if (!model) return;

  model.paths = {
    gptWeightsPath: normalizePathSepLocal(model?.paths?.gptWeightsPath || ''),
    sovitsWeightsPath: normalizePathSepLocal(model?.paths?.sovitsWeightsPath || ''),
    defaultRefAudioPath: normalizePathSepLocal(model?.paths?.defaultRefAudioPath || ''),
  };
  model.params = {
    promptText: String(model?.params?.promptText || '').trim(),
    promptLang: String(model?.params?.promptLang || 'zh').trim() || 'zh',
    textLang: String(model?.params?.textLang || 'auto').trim() || 'auto',
    textSplitMethod: String(model?.params?.textSplitMethod || 'cut5').trim() || 'cut5',
    speedFactor: Number.isFinite(Number(model?.params?.speedFactor)) ? Number(model?.params?.speedFactor) : 1,
    mediaType: String(model?.params?.mediaType || 'wav').trim() || 'wav',
    streamingMode: !!model?.params?.streamingMode,
    modelSwitchMode: normalizeGptSoVitsSwitchMode(model?.params?.modelSwitchMode || 'set_weights'),
    setModelEndpoint: String(model?.params?.setModelEndpoint || '/set_model').trim() || '/set_model',
    strictWeightSwitch: !!model?.params?.strictWeightSwitch,
  };
  model.refAudios = (Array.isArray(model.refAudios) ? model.refAudios : []).map((item, index) =>
    normalizeGptModelEditorRefAudio(item, index),
  );
  if (!model.defaultRefId && model.refAudios.length > 0) {
    model.defaultRefId = model.refAudios[0].id;
  }
  if (model.defaultRefId && !model.refAudios.some(item => item.id === model.defaultRefId)) {
    model.defaultRefId = model.refAudios[0]?.id || '';
  }
  model.expressionRefMap = model.expressionRefMap && typeof model.expressionRefMap === 'object'
    ? model.expressionRefMap
    : {};
}

function syncGptModelEditorExpressionRowsFromModel(): void {
  const model = gptModelEditor.value;
  if (!model) {
    gptModelEditorExpressionRows.value = [];
    return;
  }
  const rows: Array<{ expression: string; refId: string }> = [];
  const map = model.expressionRefMap && typeof model.expressionRefMap === 'object' ? model.expressionRefMap : {};
  Object.entries(map).forEach(([expression, refId]) => {
    const exprText = String(expression || '').trim();
    const targetRefId = String(refId || '').trim();
    if (!exprText || !targetRefId) return;
    rows.push({ expression: exprText, refId: targetRefId });
  });
  gptModelEditorExpressionRows.value = rows;
}

function applyGptModelEditorExpressionRowsToModel(): void {
  const model = gptModelEditor.value;
  if (!model) return;
  const validRefIds = new Set(model.refAudios.map(item => String(item?.id || '').trim()).filter(Boolean));
  const nextMap: Record<string, string> = {};
  for (const row of gptModelEditorExpressionRows.value) {
    const expression = String(row?.expression || '').trim();
    const refId = String(row?.refId || '').trim();
    if (!expression || !refId) continue;
    if (!validRefIds.has(refId)) continue;
    nextMap[expression] = refId;
  }
  model.expressionRefMap = nextMap;
}

function openGptModelEditor(modelId: string): void {
  const index = getGptModelManagerIndexById(modelId);
  if (index < 0) return;
  const source = gptModelManagerModels.value[index];
  gptModelEditor.value = deepCloneGptModels([source])[0] || null;
  gptModelEditorModelId.value = String(source?.id || '').trim();
  ensureGptModelEditorStructure();
  syncGptModelEditorExpressionRowsFromModel();
  showGptModelEditor.value = true;
}

function closeGptModelEditor(): void {
  showGptModelEditor.value = false;
  gptModelEditor.value = null;
  gptModelEditorModelId.value = '';
  gptModelEditorExpressionRows.value = [];
}

function addGptModelEditorRefAudio(): void {
  const model = gptModelEditor.value;
  if (!model) return;
  ensureGptModelEditorStructure();

  const used = new Set(model.refAudios.map(item => String(item.id || '').trim()).filter(Boolean));
  const base = `ref_${model.refAudios.length + 1}`;
  let nextId = base;
  let index = 2;
  while (used.has(nextId)) {
    nextId = `${base}_${index++}`;
  }

  model.refAudios.push({
    id: nextId,
    name: `参考音频${model.refAudios.length + 1}`,
    path: '',
    promptText: String(model.params.promptText || '').trim(),
    promptLang: String(model.params.promptLang || 'zh').trim() || 'zh',
    textLang: String(model.params.textLang || 'auto').trim() || 'auto',
  });
  if (!model.defaultRefId) {
    model.defaultRefId = nextId;
  }
}

function removeGptModelEditorRefAudio(refIndex: number): void {
  const model = gptModelEditor.value;
  if (!model) return;
  if (refIndex < 0 || refIndex >= model.refAudios.length) return;

  const removedId = String(model.refAudios[refIndex]?.id || '').trim();
  model.refAudios.splice(refIndex, 1);

  if (removedId && model.defaultRefId === removedId) {
    model.defaultRefId = model.refAudios[0]?.id || '';
  }
  if (removedId) {
    gptModelEditorExpressionRows.value = gptModelEditorExpressionRows.value.filter(row => row.refId !== removedId);
  }
}

function setGptModelEditorDefaultRef(refId: string): void {
  const model = gptModelEditor.value;
  if (!model) return;
  const id = String(refId || '').trim();
  if (!id) return;
  model.defaultRefId = id;
}

function addGptModelEditorExpressionRow(): void {
  const model = gptModelEditor.value;
  if (!model) return;
  const fallbackRefId = String(model.defaultRefId || model.refAudios[0]?.id || '').trim();
  gptModelEditorExpressionRows.value.push({
    expression: '',
    refId: fallbackRefId,
  });
}

function removeGptModelEditorExpressionRow(index: number): void {
  if (index < 0 || index >= gptModelEditorExpressionRows.value.length) return;
  gptModelEditorExpressionRows.value.splice(index, 1);
}

function saveGptModelEditor(): void {
  const model = gptModelEditor.value;
  if (!model) return;
  if (!String(model.name || '').trim()) {
    toastr.error('模型名称不能为空');
    return;
  }
  ensureGptModelEditorStructure();
  applyGptModelEditorExpressionRowsToModel();

  const targetIndex = getGptModelManagerIndexById(gptModelEditorModelId.value);
  if (targetIndex < 0) {
    toastr.error('保存失败：模型不存在');
    return;
  }

  const list = gptModelManagerModels.value.slice();
  list[targetIndex] = deepCloneGptModels([model])[0] || model;
  gptModelManagerModels.value = deepCloneGptModels(normalizeGptSoVitsModelsForStore(list));
  toastr.success('模型编辑已保存到草稿（请点击保存）');
  closeGptModelEditor();
}

function openGptModelImportJson(): void {
  gptModelImportJsonInputRef.value?.click();
}

function openGptModelImportFolder(): void {
  gptModelImportFolderInputRef.value?.click();
}

function openGptImportJson(): void {
  gptImportJsonInputRef.value?.click();
}

function openGptImportFolder(): void {
  gptImportFolderInputRef.value?.click();
}

async function onGptModelImportJsonChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(String(text || '[]'));
    if (!Array.isArray(parsed)) {
      toastr.error('导入失败：JSON 需为数组');
      return;
    }

    const normalizedIncoming = normalizeGptSoVitsModelsForStore(parsed);
    const existingNormalized = normalizeGptSoVitsModelsForStore(settings.value.gptSoVits.models || []);
    const merged = mergeGptSoVitsModelsByName(existingNormalized, normalizedIncoming);
    const legacyVoices = syncLegacyVoicesFromModels(merged);

    settings.value.gptSoVits.models = merged as any;
    settings.value.gptSoVits.voices = legacyVoices as any;
    setGptSoVitsModelsTextarea(merged);
    setGptSoVitsVoicesTextarea(legacyVoices);
    syncGptModelManagerFromSettings();
    await refreshTtsVoices();

    toastr.success(`已导入模型：${normalizedIncoming.length} 条`);
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 模型 JSON 导入失败:`, e);
    toastr.error('导入失败：JSON 解析错误');
  } finally {
    if (input) input.value = '';
  }
}

async function onGptModelImportFolderChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const fileList = input?.files;
  if (!fileList || fileList.length === 0) return;

  try {
    const previousPrefix = normalizeImportRootPathLocal(
      settings.value.gptSoVits.importPathPrefix || settings.value.gptSoVits.rootDir || '',
    );
    const prefix = promptGptImportPrefix(previousPrefix);
    if (!prefix) {
      toastr.info('已取消导入：未填写导入根路径');
      return;
    }
    syncGptImportPrefix(prefix);

    const rootName = getRelativeRootNameFromFiles(Array.from(fileList));
    const inferred = inferGptSoVitsModelsFromFolderFiles(fileList as any, prefix, { relativeRootName: rootName });
    if (!inferred || inferred.length === 0) {
      toastr.warning('未识别到可导入模型（至少需要参考音频）');
      return;
    }

    const existingNormalized = normalizeGptSoVitsModelsForStore(settings.value.gptSoVits.models || []);
    const merged = mergeGptSoVitsModelsByName(existingNormalized, inferred);
    const legacyVoices = syncLegacyVoicesFromModels(merged);

    settings.value.gptSoVits.models = merged as any;
    settings.value.gptSoVits.voices = legacyVoices as any;
    setGptSoVitsModelsTextarea(merged);
    setGptSoVitsVoicesTextarea(legacyVoices);
    syncGptModelManagerFromSettings();
    await refreshTtsVoices();

    const hasRelativePath = inferred.some(model => {
      const p = String(model?.paths?.defaultRefAudioPath || '').trim();
      return p && !isAbsoluteFileSystemPath(p);
    });
    let msg = `已从文件夹导入模型：${inferred.length} 条`;
    if (hasRelativePath) {
      msg += '（部分路径仍为相对路径，请检查导入根路径）';
    }
    toastr.success(msg);
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 模型文件夹导入失败:`, e);
    toastr.error('文件夹导入失败');
  } finally {
    if (input) input.value = '';
  }
}

async function onGptImportJsonChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(String(text || '[]'));
    if (!Array.isArray(parsed)) {
      toastr.error('导入失败：JSON 需为数组');
      return;
    }

    const normalizedIncoming = normalizeGptSoVitsVoicesForStore(parsed);
    const existingNormalized = normalizeGptSoVitsVoicesForStore(settings.value.gptSoVits.voices || []).voices;
    const merged = mergeGptSoVitsVoicesByName(existingNormalized, normalizedIncoming.voices);

    settings.value.gptSoVits.voices = merged as any;
    settings.value.gptSoVits.models = [] as any;
    setGptSoVitsModelsTextarea([]);
    setGptSoVitsVoicesTextarea(merged);
    syncGptModelManagerFromSettings();
    await refreshTtsVoices();

    let msg = `已导入音色：${normalizedIncoming.voices.length} 条`;
    if (normalizedIncoming.ignoredCount > 0) msg += `，忽略无效 ${normalizedIncoming.ignoredCount} 条`;
    if (normalizedIncoming.missingRefCount > 0) msg += `，其中 ${normalizedIncoming.missingRefCount} 条缺 refAudioPath`;
    toastr.success(msg);
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 导入 JSON 失败:`, e);
    toastr.error('导入失败：JSON 解析错误');
  } finally {
    if (input) input.value = '';
  }
}

async function onGptImportFolderChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const fileList = input?.files;
  if (!fileList || fileList.length === 0) return;

  try {
    const previousPrefix = normalizeImportRootPathLocal(
      settings.value.gptSoVits.importPathPrefix || settings.value.gptSoVits.rootDir || '',
    );
    const prefix = promptGptImportPrefix(previousPrefix);
    if (!prefix) {
      toastr.info('已取消导入：未填写导入根路径');
      return;
    }
    syncGptImportPrefix(prefix);

    const inferred = inferGptSoVitsVoicesFromFolderFiles(fileList as any, prefix);
    if (!inferred || inferred.length === 0) {
      toastr.warning('未识别到可导入音色（至少需要参考音频）');
      return;
    }

    const normalizedIncoming = normalizeGptSoVitsVoicesForStore(inferred);
    const existingNormalized = normalizeGptSoVitsVoicesForStore(settings.value.gptSoVits.voices || []).voices;
    const merged = mergeGptSoVitsVoicesByName(existingNormalized, normalizedIncoming.voices);

    settings.value.gptSoVits.voices = merged as any;
    settings.value.gptSoVits.models = [] as any;
    setGptSoVitsModelsTextarea([]);
    setGptSoVitsVoicesTextarea(merged);
    syncGptModelManagerFromSettings();
    await refreshTtsVoices();

    const hasRelativePath = normalizedIncoming.voices.some(v => !isAbsoluteFileSystemPath(v.refAudioPath || ''));
    let msg = `已从文件夹导入：${normalizedIncoming.voices.length} 条`;
    if (hasRelativePath) {
      msg += '（部分路径仍为相对路径，请检查导入根路径）';
    }
    toastr.success(msg);
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 文件夹导入失败:`, e);
    toastr.error('文件夹导入失败');
  } finally {
    if (input) input.value = '';
  }
}

function exportGptSoVitsVoices(): void {
  try {
    const voices = settings.value.gptSoVits?.voices || [];
    const blob = new Blob([JSON.stringify(voices, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gpt_sovits_voices.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastr.success('已导出 gpt_sovits_voices.json');
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 导出失败:`, e);
    toastr.error('导出失败');
  }
}

function exportGptSoVitsModels(): void {
  try {
    const models = settings.value.gptSoVits?.models || [];
    const blob = new Blob([JSON.stringify(models, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gpt_sovits_models.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastr.success('已导出 gpt_sovits_models.json');
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 模型导出失败:`, e);
    toastr.error('导出失败');
  }
}

async function addGptSoVitsModelTemplate(): Promise<void> {
  try {
    const current = getGptModelsFromTextarea();
    const template = createGptSoVitsModelTemplateConfig();

    const merged = mergeGptSoVitsModelsByName(current, [template]);
    const legacyVoices = syncLegacyVoicesFromModels(merged);
    settings.value.gptSoVits.models = merged as any;
    settings.value.gptSoVits.voices = legacyVoices as any;
    setGptSoVitsModelsTextarea(merged);
    setGptSoVitsVoicesTextarea(legacyVoices);
    syncGptModelManagerFromSettings();
    await refreshTtsVoices();
    toastr.success('已添加一条模型模板');
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 添加模型模板失败:`, e);
    toastr.error('添加模板失败，请先修复 JSON');
  }
}

function saveGptSoVitsModels(): void {
  let parsed: any = null;
  try {
    parsed = JSON.parse(gptSoVitsModelsJson.value || '[]');
  } catch {
    toastr.error('模型列表 JSON 解析失败');
    return;
  }
  if (!Array.isArray(parsed)) {
    toastr.error('模型列表必须是数组');
    return;
  }

  const normalized = normalizeGptSoVitsModelsForStore(parsed);
  const legacyVoices = syncLegacyVoicesFromModels(normalized);

  settings.value.gptSoVits.models = normalized as any;
  settings.value.gptSoVits.voices = legacyVoices as any;
  setGptSoVitsModelsTextarea(normalized as any[]);
  setGptSoVitsVoicesTextarea(legacyVoices as any[]);
  syncGptModelManagerFromSettings();

  const firstUsable = pickFirstUsableGptSoVitsVoice(getGptSoVitsVoiceList());
  if (!settings.value.ttsDefaultSpeaker && firstUsable?.name) {
    settings.value.ttsDefaultSpeaker = firstUsable.name;
  }

  void refreshTtsVoices();
  toastr.success(`GPT-SoVITS 模型列表已保存：${normalized.length} 条`);
}

async function addGptSoVitsVoiceTemplate(): Promise<void> {
  try {
    const current = getGptVoicesFromTextarea().voices;
    const template = {
      name: '新音色',
      desc: '手动添加',
      refAudioPath: '',
      promptText: '',
      promptLang: 'zh',
      textLang: 'zh',
      gptWeightsPath: '',
      sovitsWeightsPath: '',
      modelSwitchMode: 'set_weights',
      setModelEndpoint: '/set_model',
      strictWeightSwitch: false,
    };
    const merged = mergeGptSoVitsVoicesByName(current, [template]);
    settings.value.gptSoVits.voices = merged as any;
    settings.value.gptSoVits.models = [] as any;
    setGptSoVitsModelsTextarea([]);
    setGptSoVitsVoicesTextarea(merged);
    syncGptModelManagerFromSettings();
    await refreshTtsVoices();
    toastr.success('已添加一条音色模板');
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] GPT-SoVITS 添加模板失败:`, e);
    toastr.error('添加模板失败，请先修复 JSON');
  }
}

function saveGptSoVitsVoices(): void {
  let parsed: any = null;
  try {
    parsed = JSON.parse(gptSoVitsVoicesJson.value || '[]');
  } catch {
    toastr.error('音色列表 JSON 解析失败');
    return;
  }
  if (!Array.isArray(parsed)) {
    toastr.error('音色列表必须是数组');
    return;
  }

  const normalized = normalizeGptSoVitsVoicesForStore(parsed);
  settings.value.gptSoVits.voices = normalized.voices as any;
  settings.value.gptSoVits.models = [] as any;
  setGptSoVitsModelsTextarea([]);
  setGptSoVitsVoicesTextarea(normalized.voices as any[]);
  syncGptModelManagerFromSettings();

  const firstUsable = pickFirstUsableGptSoVitsVoice(getGptSoVitsVoiceList());
  if (!settings.value.ttsDefaultSpeaker && firstUsable?.name) {
    settings.value.ttsDefaultSpeaker = firstUsable.name;
  }

  void refreshTtsVoices();

  let msg = `GPT-SoVITS 音色列表已保存：${normalized.voices.length} 条`;
  if (normalized.ignoredCount > 0) msg += `（忽略无效条目 ${normalized.ignoredCount} 条）`;
  if (normalized.missingRefCount > 0) msg += `（${normalized.missingRefCount} 条缺 refAudioPath）`;
  toastr.success(msg);
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

async function testTts(): Promise<void> {
  if (!ttsEnabled.value) return;
  const text = String(ttsTestText.value || '').trim() || '你好，这是一段 TTS 配音测试。';
  const speaker = getCurrentCharacterId();
  let voiceName = String(settings.value.ttsDefaultSpeaker || '').trim();

  if (settings.value.ttsProvider === TTS_PROVIDER.GPT_SOVITS_V2) {
    const voices = getGptSoVitsVoiceList();
    const selected = voices.find(v => v.name === voiceName) || null;
    const selectedUsable = !!String(selected?.gptSoVits?.refAudioPath || '').trim();
    const fallback = pickFirstUsableGptSoVitsVoice(voices);
    const target = selectedUsable ? selected : fallback;
    const targetName = String(target?.name || '').trim();

    if (!targetName) {
      toastr.error('请先配置至少一个可用音色（refAudioPath 不能为空）');
      return;
    }

    if (voiceName !== targetName) {
      settings.value.ttsDefaultSpeaker = targetName;
      voiceName = targetName;
      toastr.info(`已自动切换试听音色为：${targetName}`);
    }
  } else if (settings.value.ttsProvider === TTS_PROVIDER.EDGE_TTS_DIRECT && !voiceName) {
    const voices = ttsVoiceList.value.length > 0 ? ttsVoiceList.value : await getTTSVoiceListAsync();
    const fallbackName = String(voices[0]?.name || voices[0]?.value || '').trim();
    if (!fallbackName) {
      toastr.error('当前无可用 EdgeTTS 音色，请先刷新音色列表');
      return;
    }
    settings.value.ttsDefaultSpeaker = fallbackName;
    voiceName = fallbackName;
  }

  try {
    TTSManager.stop();
    await TTSManager.speak(
      { type: 'dialogue', speaker, text, tts: voiceName ? { speaker: voiceName } : undefined },
      `desktop_pet_tts_test_${Date.now()}`,
    );
  } catch (e) {
    console.warn(`[${SCRIPT_NAME}] TTS 试听失败:`, e);
  }
}

function stopTts(): void {
  try {
    TTSManager.stop();
  } catch {
    // ignore
  }
}

function applyLipSyncManualParams(): void {
  const raw = String(lipSyncManualParamsText.value || '');
  const parts = raw
    .split(/[\n,]/)
    .map(item => String(item || '').trim())
    .filter(Boolean);

  const dedup = Array.from(new Set(parts));
  settings.value.lipSyncManualParamIds = dedup;
  lipSyncManualParamsText.value = dedup.join('\n');
}

function close() {
  applyLipSyncManualParams();
  closeGptModelManager();
  emit('close');
}

watch(
  () => props.visible,
  visible => {
    if (!visible) {
      closeGptModelManager();
      return;
    }
    ensureNumericSettingsIntegrity();
    activeSection.value = 'api';
    customModelUrl.value = settings.value.modelPath || '';
    showEmotionAdvanced.value = false;
    ttsEnabled.value = getTTSEnabled();
    localModelStatus.value = '';
    localModelError.value = '';
    lipSyncManualParamsText.value = Array.isArray(settings.value.lipSyncManualParamIds)
      ? settings.value.lipSyncManualParamIds.join('\n')
      : '';
    settings.value.gptSoVits.modelSwitchMode = normalizeGptSoVitsSwitchMode(settings.value.gptSoVits.modelSwitchMode);
    const syncedPrefix = normalizeImportRootPathLocal(
      settings.value.gptSoVits.importPathPrefix || settings.value.gptSoVits.rootDir || '',
    );
    settings.value.gptSoVits.rootDir = syncedPrefix;
    settings.value.gptSoVits.importPathPrefix = syncedPrefix;
    settings.value.gptSoVits.setModelEndpoint = String(settings.value.gptSoVits.setModelEndpoint || '/set_model').trim()
      || '/set_model';
    if (!Array.isArray((settings.value.gptSoVits as any).models)) {
      (settings.value.gptSoVits as any).models = [];
    }
    if (!Array.isArray((settings.value.gptSoVits as any).voices)) {
      (settings.value.gptSoVits as any).voices = [];
    }
    try {
      gptSoVitsModelsJson.value = JSON.stringify(settings.value.gptSoVits?.models || [], null, 2);
    } catch {
      gptSoVitsModelsJson.value = '[]';
    }
    try {
      gptSoVitsVoicesJson.value = JSON.stringify(settings.value.gptSoVits?.voices || [], null, 2);
    } catch {
      gptSoVitsVoicesJson.value = '[]';
    }
    syncGptModelManagerFromSettings();
    void refreshTtsVoices();
    refreshDiceReferenceSheetOptions();
    void refreshLocalModelInfo();
  },
  { immediate: true },
);

watch(
  () => settings.value.ttsProvider,
  () => {
    try {
      TTSManager._refreshProviderState();
    } catch {
      // ignore
    }
    void refreshTtsVoices();
  },
);

watch(
  () => settings.value.useDiceDatabaseReference,
  enabled => {
    if (!enabled) return;
    refreshDiceReferenceSheetOptions();
  },
);
</script>

<style lang="scss" scoped>
@use './styles/theme-arknights.scss' as theme;

.settings-overlay {
  @include theme.overlay-backdrop(10001, 0.82);
  padding: 12px;
  box-sizing: border-box;
  overflow: auto;
}

.settings-panel {
  width: min(1080px, calc(100vw - 24px));
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

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 18px;
  border-bottom: 2px solid theme.$ark-accent-yellow;
  background: rgba(0, 0, 0, 0.32);
}

.header-title {
  min-width: 0;

  h3 {
    margin: 0;
    font-size: 20px;
    line-height: 1;
    font-family: theme.$font-en;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  p {
    margin: 4px 0 0;
    font-size: 10px;
    color: theme.$ark-text-sub;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
}

.close-btn {
  @include theme.ark-button-base;
  min-width: 88px;
  height: 32px;
  padding: 0 10px;
  font-size: 12px;
}

.panel-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px 1fr;
}

.panel-nav {
  border-right: 1px solid rgba(255, 255, 255, 0.16);
  padding: 12px;
  overflow: auto;
  @include theme.ark-scrollbar;
}

.nav-btn {
  @include theme.ark-button-base;
  width: 100%;
  min-height: 62px;
  padding: 10px 12px;
  margin-bottom: 10px;
  text-align: left;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    'idx label'
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
}

.nav-index {
  grid-area: idx;
  align-self: center;
  font-family: theme.$font-en;
  color: theme.$ark-accent-cyan;
  font-size: 18px;
}

.nav-label {
  grid-area: label;
  font-family: theme.$font-en;
  font-size: 13px;
  letter-spacing: 0.05em;
}

.nav-sub {
  grid-area: sub;
  font-size: 10px;
  color: theme.$ark-text-sub;
  letter-spacing: 0.06em;
}

.panel-body {
  padding: 14px 18px 16px;
  overflow: auto;
  @include theme.ark-scrollbar;
}

.setting-section {
  max-width: 740px;

  h4 {
    @include theme.section-title;
  }
}

.section-index {
  color: theme.$ark-accent-cyan;
  font-family: theme.$font-en;
  font-size: 13px;
}

.section-label {
  font-family: theme.$font-en;
  font-size: 14px;
  letter-spacing: 0.04em;
}

.section-sub {
  font-size: 10px;
  color: theme.$ark-text-sub;
  letter-spacing: 0.06em;
}

.form-group {
  margin-bottom: 12px;

  > label {
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    color: #d5d5d5;
    line-height: 1.35;
  }

  > label > input[type='checkbox'] {
    margin-right: 8px;
    accent-color: theme.$ark-accent-cyan;
  }

  input[type='text'],
  input[type='password'],
  input[type='number'],
  select,
  textarea {
    @include theme.ark-input-base;
  }

  textarea {
    resize: vertical;
    min-height: 86px;
    font-family: theme.$font-mono;
    color: #fff;
  }

  select {
    color: #fff;
    font-family: theme.$font-cn;
  }

  select option {
    background: #101010;
    color: #fff;
  }

  input[type='range'] {
    width: 100%;
    appearance: none;
    height: 4px;
    border: none;
    background: #4a4a4a;
    border-radius: 0;
    padding: 0;
    margin: 7px 0 4px;
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 12px;
    height: 12px;
    background: theme.$ark-accent-yellow;
    border: 2px solid #000;
    transform: rotate(45deg);
  }

  input[type='range']::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 2px solid #000;
    border-radius: 0;
    background: theme.$ark-accent-yellow;
    transform: rotate(45deg);
  }

  input[type='range']::-moz-range-track {
    height: 4px;
    background: #4a4a4a;
    border: none;
  }

  input[type='checkbox'] {
    accent-color: theme.$ark-accent-cyan;
  }

  .hint {
    margin-top: 4px;
    font-size: 11px;
    color: theme.$ark-text-sub;
  }
}

.hint-error {
  color: theme.$ark-danger !important;
}

.form-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;

  .half {
    flex: 1;
    min-width: 0;
  }
}

.dice-sheet-list {
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.dice-sheet-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  color: #e8e8e8;
  line-height: 1.35;
}

.dice-sheet-item input[type='checkbox'] {
  margin: 0;
}

.input-with-btn {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  align-items: stretch;

  .input-btn {
    @include theme.ark-button-base;
    min-width: 84px;
    padding: 0 12px;
    font-size: 11px;
    white-space: nowrap;
  }
}

.model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hidden-file-input {
  display: none;
}

.local-model-info {
  margin-top: 6px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.04);
  font-size: 12px;
  line-height: 1.45;
  color: #e8e8e8;
}

.model-btn {
  @include theme.ark-button-base;
  min-height: 30px;
  padding: 0 12px;
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0.03em;

  &.active {
    background: theme.$ark-accent-yellow;
    border-color: theme.$ark-accent-yellow;
    color: #000;
  }

  &.browse-btn {
    border-color: rgba(0, 218, 194, 0.55);
    color: #b2fff6;

    &:hover {
      background: theme.$ark-accent-cyan;
      border-color: theme.$ark-accent-cyan;
      color: #000;
    }
  }
}

.emotion-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 14px;
  align-items: start;
}

.emotion-configs {
  min-width: 0;
}

.emotion-preview-panel {
  position: sticky;
  top: 10px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.28);
  padding: 10px 12px 12px;
  @include theme.tech-grid(18px, 0.02);
}

.emotion-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.emotion-preview-title {
  font-family: theme.$font-en;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: theme.$ark-accent-cyan;
}

.emotion-preview-tag {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}

.emotion-preview-canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.18);
}

.emotion-preview-interact {
  position: absolute;
  inset: 0;
  z-index: 3;
}

.emotion-preview-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  text-align: center;
  z-index: 4;
  pointer-events: none;
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
}

.emotion-preview-controls {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.emotion-zoom-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
}

.zoom-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}

.zoom-value {
  font-size: 12px;
  color: theme.$ark-accent-yellow;
  font-variant-numeric: tabular-nums;
}

.emotion-preview-actions {
  display: flex;
  gap: 8px;
}

.emotion-tag {
  font-family: theme.$font-en;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: theme.$ark-accent-yellow;
  text-transform: uppercase;
}

.emotion-map-table {
  margin-top: 4px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.22);
  max-height: none;
  overflow: visible;
  @include theme.tech-grid(20px, 0.02);
}

.emotion-map-head,
.emotion-map-row {
  display: grid;
  grid-template-columns: 72px 22px minmax(0, 1fr) minmax(0, 1fr) 52px;
  gap: 10px;
  align-items: center;
}

.emotion-map-head {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 8px 10px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.68);
  letter-spacing: 0.03em;
  background: rgba(2, 8, 20, 0.92);
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.emotion-map-row {
  padding: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.emotion-map-row:nth-child(odd) {
  background: rgba(255, 255, 255, 0.02);
}

.emotion-map-tag {
  font-family: theme.$font-en;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: theme.$ark-accent-yellow;
}

.emotion-map-arrow {
  text-align: center;
  color: rgba(255, 255, 255, 0.78);
  font-size: 18px;
  line-height: 1;
}

.emotion-map-preview-btn {
  min-width: 0;
  width: 44px;
  height: 32px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
}

.emotion-map-row select {
  width: 100%;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.emotion-advanced-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.emotion-advanced-item {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.28);
  padding: 10px 12px 2px;
  @include theme.tech-grid(18px, 0.025);
}

.emotion-advanced-title {
  margin-bottom: 8px;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.85);
}

.advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.04);
  font-size: 11px;
  color: #d5d5d5;
  cursor: pointer;
  user-select: none;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);

  &:hover {
    border-color: rgba(255, 225, 0, 0.65);
    color: theme.$ark-accent-yellow;
  }

  .toggle-icon {
    width: 12px;
    text-align: center;
    color: theme.$ark-accent-cyan;
  }
}

.advanced-params {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px dashed rgba(255, 255, 255, 0.2);
}

.about-card {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.26);
  @include theme.tech-grid(18px, 0.02);
}

.about-title {
  margin-bottom: 8px;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: theme.$ark-accent-yellow;
}

.about-link {
  color: theme.$ark-accent-cyan;
  word-break: break-all;
  text-decoration: underline;
}

.about-list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: #d5d5d5;
}

.status-badge {
  margin-left: 8px;
  font-size: 12px;
}

.status-success {
  color: theme.$ark-accent-cyan;
}

.status-fail {
  color: #ff9c94;
}

.panel-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.36);
}

.btn {
  @include theme.ark-button-base;
  min-width: 100px;
  height: 34px;
  padding: 0 14px;
  font-size: 12px;
}

.btn-primary {
  background: theme.$ark-accent-yellow;
  color: #000;
  border-color: theme.$ark-accent-yellow;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.3);
}

.btn-test {
  min-width: 96px;
  background: rgba(0, 218, 194, 0.1);
  border-color: rgba(0, 218, 194, 0.6);
  color: #bcfff7;

  &:hover:not(:disabled) {
    background: theme.$ark-accent-cyan;
    border-color: theme.$ark-accent-cyan;
    color: #000;
  }
}

.browser-overlay {
  @include theme.overlay-backdrop(10002, 0.8);
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

.gpt-model-dialog {
  width: min(1240px, calc(100vw - 24px));
}

.gpt-model-editor-dialog {
  width: min(1080px, calc(100vw - 24px));
}

.gpt-model-header {
  align-items: flex-start;
}

.gpt-model-header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
}

.gpt-model-header-actions .btn {
  min-width: 84px;
  height: 30px;
  padding: 0 10px;
  font-size: 11px;
}

.gpt-model-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gpt-model-tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  align-items: center;
}

.gpt-model-tools input {
  @include theme.ark-input-base;
}

.gpt-model-card-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gpt-model-card {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.03);
  padding: 10px 12px;
  @include theme.tech-grid(18px, 0.02);
}

.gpt-model-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.gpt-model-card-head label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.gpt-model-id {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.65);
  font-family: theme.$font-mono;
  word-break: break-all;
}

.gpt-model-card-actions {
  margin-top: 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gpt-model-card-actions .btn {
  min-width: 110px;
}

.gpt-ref-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 8px;
}

.gpt-ref-item {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.02);
  padding: 10px;
}

.gpt-ref-actions {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.gpt-expression-map-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.gpt-expression-map-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.gpt-expression-map-row input,
.gpt-expression-map-row select {
  @include theme.ark-input-base;
  width: 100%;
}

@media (max-width: 860px) {
  .settings-overlay {
    align-items: flex-start;
    padding: calc(env(safe-area-inset-top) + 6px) 6px calc(env(safe-area-inset-bottom) + 6px);
  }

  .settings-panel {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 12px);
    clip-path: none;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
  }

  .settings-panel::before {
    width: 40px;
  }

  .panel-main {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    min-height: 0;
  }

  .panel-nav {
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.16);
    display: flex;
    gap: 6px;
    padding: 8px 10px;
    overflow-x: auto;
    overflow-y: hidden;
    @include theme.ark-scrollbar;
  }

  .nav-btn {
    flex: 0 0 auto;
    width: 150px;
    min-height: 42px;
    padding: 6px 10px;
    margin-bottom: 0;
    grid-template-areas: 'idx label';
    grid-template-columns: auto 1fr;
    row-gap: 0;
    align-items: center;
  }

  .panel-body {
    min-height: 0;
  }

  .nav-index {
    font-size: 16px;
  }

  .nav-label {
    font-size: 12px;
  }

  .nav-sub {
    display: none;
  }

  .browser-overlay {
    align-items: flex-start;
    padding: calc(env(safe-area-inset-top) + 6px) 6px calc(env(safe-area-inset-bottom) + 6px);
  }

  .browser-dialog {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 12px);
    clip-path: none;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
  }

  .gpt-model-dialog,
  .gpt-model-editor-dialog {
    width: 100%;
    max-height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 12px);
  }

  .gpt-model-tools {
    grid-template-columns: 1fr;
  }

  .gpt-expression-map-row {
    grid-template-columns: 1fr;
  }

  .emotion-layout {
    grid-template-columns: 1fr;
  }

  .emotion-preview-panel {
    order: -1;
    position: sticky;
    top: 8px;
    z-index: 8;
    margin-bottom: 8px;
    padding: 8px 10px 10px;
    background: rgba(0, 0, 0, 0.9);
  }

  .emotion-preview-header {
    margin-bottom: 6px;
  }

  .emotion-preview-canvas {
    aspect-ratio: 16 / 9;
    max-height: 210px;
  }

  .emotion-preview-controls {
    margin-top: 8px;
    gap: 6px;
  }

  .emotion-map-head {
    position: static;
  }

  .emotion-preview-controls .hint {
    display: none;
  }
}

@media (max-width: 620px) {
  .settings-overlay {
    align-items: stretch;
    padding: 0;
  }

  .settings-panel {
    width: 100vw;
    max-height: 100dvh;
    border-left: none;
    border-right: none;
    box-shadow: none;
  }

  .panel-header {
    padding: 10px 12px;
  }

  .header-title {
    h3 {
      font-size: 15px;
      letter-spacing: 0.06em;
    }

    p {
      display: none;
    }
  }

  .panel-nav {
    padding: 6px 8px;
  }

  .nav-btn {
    width: 126px;
    min-height: 38px;
    padding: 5px 8px;
  }

  .nav-index {
    font-size: 14px;
  }

  .nav-label {
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .close-btn {
    min-width: 66px;
    height: 28px;
    padding: 0 8px;
    font-size: 11px;
  }

  .panel-footer {
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  }

  .panel-body {
    padding: 8px 10px;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .input-with-btn {
    grid-template-columns: 1fr;
  }

  .btn {
    min-width: 86px;
  }

  .emotion-preview-panel {
    top: 6px;
    padding: 8px;
  }

  .emotion-preview-canvas {
    max-height: 180px;
  }

  .emotion-map-head,
  .emotion-map-row {
    grid-template-columns: 56px 16px minmax(0, 1fr) minmax(0, 1fr) 42px;
    gap: 6px;
  }

  .emotion-map-row {
    padding: 8px;
  }

  .emotion-map-arrow {
    font-size: 14px;
  }

  .emotion-map-preview-btn {
    width: 38px;
    height: 30px;
    font-size: 12px;
  }

  .browser-overlay {
    align-items: stretch;
    padding: 0;
  }

  .browser-dialog {
    width: 100vw;
    max-height: 100dvh;
    box-shadow: none;
    clip-path: none;
  }

  .gpt-model-dialog,
  .gpt-model-editor-dialog {
    width: 100vw;
    max-height: 100dvh;
    box-shadow: none;
    clip-path: none;
  }

  .browser-dialog-header {
    padding: 12px;
  }

  .browser-dialog-body {
    padding: 10px 12px 12px;
  }

  .gpt-model-header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .gpt-model-card-actions .btn {
    min-width: 0;
    flex: 1 1 120px;
  }
}
</style>
