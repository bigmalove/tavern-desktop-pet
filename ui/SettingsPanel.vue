<template>
  <div>
    <div
      v-if="visible"
      class="settings-overlay dp-settings-overlay"
      :style="overlayFallbackStyle"
      @click.self="close"
    >
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
                  <input
                    type="text"
                    v-model="settings.apiConfig.url"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div class="form-group">
                  <label>API Key</label>
                  <input
                    type="password"
                    v-model="settings.apiConfig.apiKey"
                    placeholder="sk-..."
                  />
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
                    @click="testConnection"
                    :disabled="!settings.apiConfig.url || testingConnection"
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
                    <input
                      type="range"
                      v-model.number="settings.apiConfig.temperature"
                      min="0"
                      max="2"
                      step="0.1"
                    />
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
                      <input
                        type="range"
                        v-model.number="settings.apiConfig.top_p"
                        min="0"
                        max="1"
                        step="0.01"
                      />
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
                <label>模型路径 / 远程 URL</label>
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
                  <button class="model-btn browse-btn" type="button" @click="showBrowser = true">
                    浏览在线模型库
                  </button>
                </div>
              </div>

              <div class="form-group">
                <label>宠物缩放 ({{ petScaleLabel }})</label>
                <input
                  type="range"
                  v-model.number="settings.petScale"
                  min="0.1"
                  max="3"
                  step="0.05"
                />
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.useCdn" />
                  使用 CDN 加速（jsDelivr）
                </label>
                <div class="hint">关闭后将直接从 GitHub 原始地址加载，适用于 CDN 不可用时。</div>
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
                <textarea
                  v-model="settings.customPrompt"
                  rows="4"
                  placeholder="输入自定义的系统提示词..."
                ></textarea>
              </div>

              <div class="form-group">
                <label>角色名（留空则关闭角色视角）</label>
                <input
                  type="text"
                  v-model="settings.roleplayName"
                  placeholder="例如：阿米娅"
                />
                <div class="hint">
                  填写后，吐槽和手动聊天会以该角色视角发言。
                </div>
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
                <div class="hint">
                  开启后会附带当前角色卡的描述/性格/场景等内容，帮助贴合人设。
                </div>
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
                    <option
                      v-for="option in commentTriggerModeOptions"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </div>
                <div class="form-row">
                  <div class="form-group half">
                    <label>触发间隔（每 N 条消息）</label>
                    <input
                      type="number"
                      v-model.number="settings.triggerInterval"
                      min="1"
                      max="100"
                    />
                  </div>
                  <div class="form-group half">
                    <label>触发概率 ({{ settings.triggerProbability }}%)</label>
                    <input
                      type="range"
                      v-model.number="settings.triggerProbability"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              </template>

              <div class="form-group">
                <label>传给 LLM 的最近聊天条数</label>
                <input
                  type="number"
                  v-model.number="settings.maxChatContext"
                  min="1"
                  max="50"
                />
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.useTamakoTodaySpecial" />
                  兼容 Tamako Market：读取“今日特选”参与点评
                </label>
                <div class="hint">
                  开启后会优先读取 Tamako Market（玉子市场）“今日特选”内容作为最新点评上下文；读取失败时自动回退到聊天记录。
                </div>
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
                      启用表情 COT 输出
                    </label>
                    <div class="hint">
                      开启后，LLM 将按 <code>桌面宠物[表情|语气]: 正文</code> 输出；气泡/TTS 会自动剥离前缀，并联动 Live2D 表情/动作。
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
                      <button class="btn btn-secondary" type="button" @click="resetEmotionConfigs">
                        重置为默认表情配置
                      </button>
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
                    <button class="btn btn-secondary" type="button" @click="clearLive2DOverrides">
                      清空 Live2D 覆盖
                    </button>
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
                      <select v-model="cfg.live2dMotion.group" :disabled="!cfg.live2dMotion.enabled">
                        <option value="">（自动匹配）</option>
                        <option
                          v-if="cfg.live2dMotion.group && !live2dMotionOptionSet.has(cfg.live2dMotion.group)"
                          :value="cfg.live2dMotion.group"
                        >
                          {{ cfg.live2dMotion.group }}（自定义）
                        </option>
                        <option v-for="opt in live2dMotionSelectOptions" :key="opt.key" :value="opt.value">
                          {{ opt.label }}
                        </option>
                      </select>
                      <button class="btn btn-secondary emotion-map-preview-btn" type="button" @click="previewEmotion(cfg.tag)">
                        ▶
                      </button>
                    </div>
                  </div>

                  <div class="hint">
                    左列绑定模型 Expressions，右列绑定模型 Motions（可填动作名或动作组名）。
                  </div>

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
                          <div class="hint">当模型输出不在固定表情列表时，可用别名映射到本行的规范表情。</div>
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
                      <button class="btn btn-secondary" type="button" @click="resetPreviewViewport">
                        重置视图
                      </button>
                      <button class="btn btn-secondary" type="button" @click="replayPreview">
                        重播
                      </button>
                    </div>
                    <div class="hint">提示：拖拽预览区可移动模型，滚轮可缩放。</div>
                    <div class="hint">{{ previewStatus }}</div>
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
                </select>
              </div>

              <div class="form-group">
                <label>
                  <input type="checkbox" v-model="settings.ttsAutoPlay" />
                  自动播放（吐槽完成后朗读）
                </label>
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
                  <label>GPT-SoVITS（api_v2.py）API 地址</label>
                  <input type="text" v-model="settings.gptSoVits.apiUrl" placeholder="http://127.0.0.1:9880" />
                </div>

                <div class="form-group">
                  <label>
                    <input type="checkbox" v-model="settings.gptSoVits.useCorsProxy" />
                    使用酒馆代理（/proxy）
                  </label>
                </div>

                <div class="form-row">
                  <div class="form-group half">
                    <label>text_lang</label>
                    <input type="text" v-model="settings.gptSoVits.textLang" placeholder="auto/zh/en/ja..." />
                  </div>
                  <div class="form-group half">
                    <label>切分策略</label>
                    <input type="text" v-model="settings.gptSoVits.textSplitMethod" placeholder="cut5" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group half">
                    <label>media_type</label>
                    <select v-model="settings.gptSoVits.mediaType">
                      <option value="wav">wav</option>
                      <option value="ogg">ogg</option>
                      <option value="raw">raw</option>
                    </select>
                  </div>
                  <div class="form-group half">
                    <label>
                      <input type="checkbox" v-model="settings.gptSoVits.streamingMode" />
                      streaming_mode
                    </label>
                  </div>
                </div>

                <div class="form-group">
                  <label>speed_factor</label>
                  <input type="number" v-model.number="settings.gptSoVits.speedFactor" min="0.5" max="2" step="0.05" />
                </div>

                <div class="form-group">
                  <label>音色列表（JSON）</label>
                  <textarea
                    v-model="gptSoVitsVoicesJson"
                    rows="6"
                    placeholder='[{"name":"示例音色","refAudioPath":"wavs/xxx.wav","promptText":"示例参考文本","promptLang":"zh"}]'
                  ></textarea>
                  <div class="form-row">
                    <div class="form-group half">
                      <button class="btn btn-secondary" type="button" @click="saveGptSoVitsVoices">
                        保存音色列表
                      </button>
                    </div>
                    <div class="form-group half">
                      <button class="btn btn-test" type="button" @click="testTts" :disabled="!ttsEnabled">
                        试听
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    v-model="ttsTestText"
                    placeholder="试听文本"
                  />
                </div>
              </div>

              <div v-else class="form-group">
                <button class="btn btn-test" type="button" @click="testTts" :disabled="!ttsEnabled">
                  试听
                </button>
              </div>

              <div class="form-group">
                <button class="btn btn-secondary" type="button" @click="stopTts">
                  停止
                </button>
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
                  <li>
                    除权利人另行授权外，Live2D 模型仅供学习、研究与交流，不得用于商业用途或再分发。
                  </li>
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
                  <li>
                    使用本插件及其衍生内容时，必须遵守你所在地及适用司法辖区的法律法规；任何违反法律法规的使用行为与后果均由使用者自行承担。
                  </li>
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
      v-if="showBrowser"
      class="browser-overlay dp-browser-overlay"
      :style="overlayFallbackStyle"
      @click.self="showBrowser = false"
    >
      <div class="browser-dialog dp-browser-dialog" :style="panelFallbackStyle">
        <div class="browser-dialog-header">
          <h3>在线模型库</h3>
          <button class="close-btn" type="button" @click="showBrowser = false">✕</button>
        </div>
        <div class="browser-dialog-body">
          <ModelBrowser
            :use-cdn="settings.useCdn"
            @cancel="showBrowser = false"
            @load-model="onBrowserLoad"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from 'pinia';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { TTSManager } from '../audio/tts-manager';
import {
  TTS_PROVIDER,
  getGptSoVitsVoiceList,
  getTTSEnabled,
  getTTSVoiceListAsync,
  normalizeGptSoVitsVoicesForStore,
  pickFirstUsableGptSoVitsVoice,
  setTTSEnabled,
  type TTSSpeakerVoice,
} from '../audio/tts-config';
import {
  API_SOURCES,
  COMMENT_STYLES,
  COMMENT_TRIGGER_MODE_OPTIONS,
  DEFAULTS,
  EMOTION_TAGS,
  RECOMMENDED_MODELS,
  SCRIPT_NAME,
  type EmotionTag,
} from '../core/constants';
import { createDefaultEmotionConfigs, parseAliasesText, type EmotionConfig } from '../core/emotion';
import { useSettingsStore } from '../core/settings';
import { matchLive2DExpression, matchLive2DMotion } from '../live2d/expression-motion';
import { Live2DManager } from '../live2d/manager';
import { Live2DStage } from '../live2d/stage';
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
const topPLabel = computed(() =>
  toBoundedNumber(settings.value.apiConfig?.top_p, DEFAULTS.TOP_P, 0, 1).toFixed(2),
);
const petScaleLabel = computed(() =>
  toBoundedNumber(settings.value.petScale, DEFAULTS.PET_SCALE, 0.1, 3).toFixed(2),
);

ensureNumericSettingsIntegrity();

const recommendedModels = RECOMMENDED_MODELS;
const commentStyles = COMMENT_STYLES;
const commentTriggerModeOptions = COMMENT_TRIGGER_MODE_OPTIONS;
const apiSources = API_SOURCES;
const showBrowser = ref(false);
const customModelUrl = ref(settings.value.modelPath || '');

const ttsEnabled = ref(getTTSEnabled());
const ttsVoiceList = ref<TTSSpeakerVoice[]>([]);
const refreshingTtsVoices = ref(false);
const gptSoVitsVoicesJson = ref('');
const ttsTestText = ref('你好，这是一段 TTS 配音测试。');

const ttsVoiceHint = computed(() => {
  const providerHint =
    settings.value.ttsProvider === TTS_PROVIDER.GPT_SOVITS_V2
      ? 'GPT-SoVITS：建议把音色 name 设为角色名。'
      : 'LittleWhiteBox：未指定/未绑定时使用此默认音色。';
  const emptyHint = ttsVoiceList.value.length === 0 ? '（当前音色列表为空）' : '';
  return `${providerHint}${emptyHint}`;
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

const live2dMotionSelectOptions = computed<Array<{ key: string; value: string; label: string }>>(() => {
  const seen = new Set<string>();
  const options: Array<{ key: string; value: string; label: string }> = [];

  for (const motion of live2dMotions.value) {
    const value = String(motion?.name ?? '').trim();
    if (!value) continue;
    const dedupKey = value.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const groupLabel = motion.group ? `${motion.group}#${motion.index}` : `#${motion.index}`;
    options.push({
      key: `motion_${dedupKey}_${groupLabel}`,
      value,
      label: `${value}（动作 ${groupLabel}）`,
    });
  }

  for (const group of live2dMotionGroups.value) {
    const value = String(group?.name ?? '').trim();
    if (!value) continue;
    const dedupKey = value.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    options.push({
      key: `group_${dedupKey}_${group.count}`,
      value,
      label: `${value}（动作组 ${group.count}）`,
    });
  }

  return options.sort((a, b) => a.value.localeCompare(b.value));
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
  const base = String(customApi.apiurl || '').trim().replace(/\/+$/, '');
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
      .map((m) => ({ name: m.name, group: m.group, index: m.index }))
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
        cfg.live2dMotion.group = matchedMotion.name || matchedMotion.group;
        cfg.live2dMotion.index = matchedMotion.index || 0;
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

  const cfg = (settings.value.emotionConfigs as any as EmotionConfig[]).find((c) => c.tag === tag);
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
  emit('close');
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    ensureNumericSettingsIntegrity();
    activeSection.value = 'api';
    showEmotionAdvanced.value = false;
    ttsEnabled.value = getTTSEnabled();
    lipSyncManualParamsText.value = Array.isArray(settings.value.lipSyncManualParamIds)
      ? settings.value.lipSyncManualParamIds.join('\n')
      : '';
    try {
      gptSoVitsVoicesJson.value = JSON.stringify(settings.value.gptSoVits?.voices || [], null, 2);
    } catch {
      gptSoVitsVoicesJson.value = '[]';
    }
    void refreshTtsVoices();
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

@media (max-width: 860px) {
  .settings-overlay {
    align-items: flex-start;
    padding:
      calc(env(safe-area-inset-top) + 6px)
      6px
      calc(env(safe-area-inset-bottom) + 6px);
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
    grid-template-areas:
      'idx label';
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

  .browser-dialog-header {
    padding: 12px;
  }

  .browser-dialog-body {
    padding: 10px 12px 12px;
  }
}
</style>
