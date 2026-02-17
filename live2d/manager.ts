import { EIKANYA_CDN_BASE, EIKANYA_RAW_BASE, LIVE2D_CDN_BASE } from '../core/constants';
import { useSettingsStore } from '../core/settings';
import { error, log, warn } from '../utils/dom';
import { Live2DLoader } from './loader';
import { Live2DStage } from './stage';
import {
  collectExpressionNames,
  collectExpressionNamesFromUnknown,
  collectMotionEntries,
  collectMotionGroupCountsFromUnknown,
  collectMotionGroupNames,
  type Live2DMotionEntry,
} from './expression-motion';

const TICKER_REGISTERED_FLAG = '__desktopPetLive2dTickerV1';

export type ModelLoadProgress = {
  percent: number;
  message: string;
};

/**
 * Live2D 模型管理器
 * 负责模型加载、表情/动作管理。
 */
export const Live2DManager = {
  _JSDELIVR_HOSTS: [
    'cdn.jsdelivr.net',
    'fastly.jsdelivr.net',
    'testingcf.jsdelivr.net',
    'gcore.jsdelivr.net',
  ],
  _runtime: null as any,
  model: null as any,
  isReady: false,
  modelBaseWidth: null as number | null,
  modelBaseHeight: null as number | null,
  modelBaseBounds: null as { x: number; y: number; width: number; height: number } | null,
  _lastModelJson: null as any,
  _lastModelJsonSourceUrl: '' as string,
  _autoMotionTimer: null as number | null,
  autoMotionLoopEnabled: true,
  _mouthParamCore: null as any,
  _mouthParamIds: [] as string[],
  _mouthParamIndexes: [] as number[],
  _mouthParamRangeMins: [] as number[],
  _mouthParamRangeMaxs: [] as number[],
  _mouthParamWarned: false,
  _mouthCurrentValue: 0,
  _lipSyncActive: false,
  _inModelUpdate: false,
  _writeMaskCore: null as any,
  _writeMaskRestore: null as (() => void) | null,
  _updateHookModel: null as any,
  _updateHookRestore: null as (() => void) | null,
  _manualMouthParamEnabled: false,
  _manualMouthParamIds: [] as string[],
  _manualMouthParamIdSet: new Set<string>(),

  /** 获取父窗口 */
  _top(): Window {
    return window.parent ?? window;
  },

  /** 获取父窗口上的 PIXI 运行时 */
  _getPIXI(): any {
    const runtimePixi = Live2DLoader.getPixi(this._top());
    if (runtimePixi) return runtimePixi;
    return this._runtime?.pixi ?? null;
  },

  _encodePathSegment(segment: string): string {
    if (typeof segment !== 'string' || !segment) return segment;

    let decoded = segment;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return segment;
    }

    const safeChar = /[A-Za-z0-9\-._~!$&'()*+,;=:@]/;
    let encoded = '';
    for (const ch of decoded) {
      encoded += safeChar.test(ch) ? ch : encodeURIComponent(ch);
    }
    return encoded;
  },

  _normalizeRemoteUrl(inputUrl: string): string {
    const url = String(inputUrl || '').trim();
    if (!url) return url;

    try {
      const urlObj = new URL(url);
      urlObj.pathname = urlObj.pathname
        .split('/')
        .map(segment => this._encodePathSegment(segment))
        .join('/');
      return urlObj.toString();
    } catch {
      return url;
    }
  },

  _normalizeResourceRef(inputRef: string): string {
    const raw = String(inputRef || '').trim();
    if (!raw) return raw;

    // 在部分模型里 # 是文件名的一部分，必须编码为 %23，否则会被当作 URL 片段。
    const hashSafe = raw.replace(/#/g, '%23');
    const normalized = hashSafe.replace(/\\/g, '/');

    const qIndex = normalized.indexOf('?');
    const pathPart = qIndex >= 0 ? normalized.slice(0, qIndex) : normalized;
    const queryPart = qIndex >= 0 ? normalized.slice(qIndex) : '';

    const encodedPath = pathPart
      .split('/')
      .map(segment => this._encodePathSegment(segment))
      .join('/');

    return `${encodedPath}${queryPart.replace(/#/g, '%23')}`;
  },

  _getMirrorEikanyaModelUrl(modelUrl: string): string | null {
    const url = String(modelUrl || '').trim();
    if (!url) return null;

    if (url.startsWith(EIKANYA_CDN_BASE)) {
      return `${EIKANYA_RAW_BASE}${url.slice(EIKANYA_CDN_BASE.length)}`;
    }
    if (url.startsWith(EIKANYA_RAW_BASE)) {
      return `${EIKANYA_CDN_BASE}${url.slice(EIKANYA_RAW_BASE.length)}`;
    }
    return null;
  },

  _expandJsDelivrHosts(inputUrl: string): string[] {
    const url = String(inputUrl || '').trim();
    if (!url) return [];

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return [];
    }

    if (!urlObj.hostname.toLowerCase().endsWith('jsdelivr.net')) return [];

    const results: string[] = [];
    for (const host of this._JSDELIVR_HOSTS) {
      try {
        const u = new URL(url);
        u.hostname = host;
        results.push(u.toString());
      } catch {
        // ignore
      }
    }
    return results;
  },

  _convertJsDelivrGhToRawCandidates(inputUrl: string): string[] {
    const url = String(inputUrl || '').trim();
    if (!url) return [];

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return [];
    }

    const host = urlObj.hostname.toLowerCase();
    if (!host.endsWith('jsdelivr.net')) return [];
    if (!urlObj.pathname.startsWith('/gh/')) return [];

    const rest = urlObj.pathname.slice('/gh/'.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length < 2) return [];

    const owner = parts[0];
    const repoWithRef = parts[1];
    const filePath = parts.slice(2).join('/');
    if (!owner || !repoWithRef || !filePath) return [];

    const [repo, ref] = repoWithRef.split('@');
    const suffix = `${urlObj.search || ''}${urlObj.hash || ''}`;

    if (ref) {
      return [`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}${suffix}`];
    }

    return [
      `https://raw.githubusercontent.com/${owner}/${repo}/master/${filePath}${suffix}`,
      `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}${suffix}`,
    ];
  },

  _buildModelUrlCandidates(modelUrl: string): string[] {
    const bases: string[] = [];
    const addBase = (url: string) => {
      const normalized = this._normalizeRemoteUrl(url);
      if (!normalized) return;
      if (!bases.includes(normalized)) bases.push(normalized);
    };

    addBase(modelUrl);
    const mirrorUrl = this._getMirrorEikanyaModelUrl(modelUrl);
    if (mirrorUrl) addBase(mirrorUrl);

    const candidates: string[] = [];
    const add = (url: string) => {
      const normalized = this._normalizeRemoteUrl(url);
      if (!normalized) return;
      if (!candidates.includes(normalized)) candidates.push(normalized);
    };

    for (const base of bases) {
      add(base);
      for (const variant of this._expandJsDelivrHosts(base)) add(variant);
      for (const raw of this._convertJsDelivrGhToRawCandidates(base)) add(raw);
    }

    return candidates;
  },

  async _createModelWithTimeout(Live2DModel: any, dataUrl: string, timeoutMs = 30000): Promise<any> {
    let timer: number | null = null;
    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(() => {
          reject(new Error(`模型实例化超时 (${timeoutMs}ms)`));
        }, timeoutMs);
      });

      return await Promise.race([
        Live2DModel.from(dataUrl, {
          // 与 galgame 通用生成器一致：在挂载到带 WebGL renderer 的舞台之前禁用 autoUpdate
          // 避免部分 Cubism2/远程模型在初始化阶段抛 WebGL program 相关错误
          autoUpdate: false,
          autoInteract: false,
        }),
        timeoutPromise,
      ]);
    } finally {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    }
  },

  async _fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000): Promise<Response> {
    if (typeof AbortController === 'undefined') {
      return fetch(url, init);
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        throw new Error(`请求超时 (${timeoutMs}ms): ${url}`);
      }
      throw e;
    } finally {
      window.clearTimeout(timer);
    }
  },

  _toPositiveNumber(value: unknown, fallback: number): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  },

  _toScale(value: unknown, fallback = 1): number {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.min(20, Math.max(0.01, n));
  },

  _readModelBaseBounds(model: any): { x: number; y: number; width: number; height: number } | null {
    if (!model || typeof model.getLocalBounds !== 'function') return null;
    try {
      const bounds = model.getLocalBounds();
      if (!bounds) return null;
      const width = Number(bounds.width);
      const height = Number(bounds.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return null;
      }
      const x = Number.isFinite(Number(bounds.x)) ? Number(bounds.x) : 0;
      const y = Number.isFinite(Number(bounds.y)) ? Number(bounds.y) : 0;
      return { x, y, width, height };
    } catch {
      return null;
    }
  },

  _resolveModelBaseBounds(): { x: number; y: number; width: number; height: number } {
    if (this.modelBaseBounds) return this.modelBaseBounds;

    const measured = this._readModelBaseBounds(this.model);
    if (measured) {
      this.modelBaseBounds = measured;
      this.modelBaseWidth = measured.width;
      this.modelBaseHeight = measured.height;
      return measured;
    }

    return {
      x: 0,
      y: 0,
      width: this._toPositiveNumber(this.modelBaseWidth, 500),
      height: this._toPositiveNumber(this.modelBaseHeight, 800),
    };
  },

  _applyStageTransform(stageWidth: number, stageHeight: number, scale: number): {
    finalScale: number;
    stageWidth: number;
    stageHeight: number;
    modelWidth: number;
    modelHeight: number;
  } | null {
    if (!this.model) return null;

    const safeStageWidth = this._toPositiveNumber(stageWidth, 280);
    const safeStageHeight = this._toPositiveNumber(stageHeight, 360);
    const bounds = this._resolveModelBaseBounds();
    const safeModelWidth = this._toPositiveNumber(bounds.width, 500);
    const safeModelHeight = this._toPositiveNumber(bounds.height, 800);
    const fitScale = Math.min(safeStageWidth / safeModelWidth, safeStageHeight / safeModelHeight) * 0.9;
    const finalScale = this._toScale(fitScale * this._toScale(scale, 1), 0.3);

    this.model.visible = true;
    this.model.alpha = 1;
    this.model.scale.set(finalScale);

    if (this.model.anchor?.set) {
      this.model.anchor.set(0.5, 1);
      this.model.x = safeStageWidth / 2;
      this.model.y = safeStageHeight;
    } else if (this.model.pivot?.set) {
      this.model.pivot.set(bounds.x + safeModelWidth / 2, bounds.y + safeModelHeight);
      this.model.x = safeStageWidth / 2;
      this.model.y = safeStageHeight;
    } else {
      this.model.x = safeStageWidth / 2;
      this.model.y = safeStageHeight / 2;
    }

    return {
      finalScale,
      stageWidth: safeStageWidth,
      stageHeight: safeStageHeight,
      modelWidth: safeModelWidth,
      modelHeight: safeModelHeight,
    };
  },

  _normalizeLegacyCubism2Settings(modelJson: any): void {
    if (!modelJson || modelJson.FileReferences) return;

    const textures = modelJson.textures || modelJson.Textures;
    if (Array.isArray(textures)) return;
    if (!textures || typeof textures !== 'object') return;

    const entries = Object.entries(textures)
      .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0);
    if (entries.length === 0) return;

    const hintKeys = [
      modelJson.config?.texture,
      modelJson.config?.textureId,
      modelJson.config?.skin,
      modelJson.config?.modelId,
      modelJson.config?.defaultTexture,
      modelJson.config?.defaultSkin,
    ]
      .map(v => (v === undefined || v === null ? '' : String(v).trim()))
      .filter(Boolean);

    let selected = entries[0];
    for (const hint of hintKeys) {
      const matched = entries.find(([key]) => key === hint);
      if (matched) {
        selected = matched;
        break;
      }
    }

    const normalizedTextures = selected[1].map((item: string) => {
      const raw = String(item || '').trim();
      if (!raw) return raw;
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw;
      if (raw.startsWith('/')) return raw;
      if (raw.includes('/')) return raw;
      // 该类旧格式通常把贴图放在 textures/ 子目录，但 JSON 只给文件名。
      return `textures/${raw}`;
    });
    modelJson.textures = normalizedTextures;
    modelJson.Textures = normalizedTextures;
    log('检测到非标准 Cubism2 贴图结构，已自动转换', {
      key: selected[0],
      textureCount: normalizedTextures.length,
    });
  },

  _clearAutoMotionLoop(): void {
    if (this._autoMotionTimer !== null) {
      window.clearInterval(this._autoMotionTimer);
      this._autoMotionTimer = null;
    }
  },

  _stopCurrentMotion(reason = 'manual'): void {
    const model = this.model;
    if (!model) return;

    let stopped = false;
    const tryCall = (obj: any, method: string) => {
      if (!obj || typeof obj[method] !== 'function') return;
      try {
        obj[method]();
        stopped = true;
      } catch {
        // ignore
      }
    };

    const mm = model?.internalModel?.motionManager as any;
    const animator = model?.internalModel?.animator as any;
    const internal = model?.internalModel as any;

    tryCall(model, 'stopMotions');
    tryCall(mm, 'stopAllMotions');
    tryCall(mm, 'stopAllMotion');
    tryCall(mm, 'stopMotion');
    tryCall(mm, 'stop');
    tryCall(animator, 'stopAllMotions');
    tryCall(animator, 'stopAllMotion');
    tryCall(animator, 'stop');
    tryCall(internal, 'stopAllMotions');

    if (stopped) {
      log('已停止当前动作', { reason });
    }
  },

  _refreshManualMouthParams(): void {
    let enabled = false;
    const ids: string[] = [];
    try {
      const store = useSettingsStore();
      const s = store.settings as any;
      enabled = !!s?.lipSyncManualParamsEnabled;
      const raw = Array.isArray(s?.lipSyncManualParamIds) ? s.lipSyncManualParamIds : [];
      const set = new Set<string>();
      for (const item of raw) {
        const id = String(item || '').trim();
        if (!id) continue;
        const low = id.toLowerCase();
        if (set.has(low)) continue;
        set.add(low);
        ids.push(id);
      }
    } catch {
      // ignore
    }

    this._manualMouthParamEnabled = enabled;
    this._manualMouthParamIds = ids;
    this._manualMouthParamIdSet = new Set(ids.map(id => id.toLowerCase()));
  },

  _setLipSyncActive(active: boolean): void {
    const next = !!active;
    if (this._lipSyncActive === next) return;

    this._lipSyncActive = next;
    if (next) {
      this._refreshManualMouthParams();
      const model = this.model;
      const coreModel = model?.internalModel?.coreModel;
      if (model) this._ensureLipSyncHooks(model);
      if (coreModel) this._installCoreWriteMask(coreModel);
    }
    log(`LipSync active=${next}`);
  },

  setAutoMotionLoopEnabled(enabled: boolean): void {
    this.autoMotionLoopEnabled = Boolean(enabled);

    if (!this.model) {
      this._clearAutoMotionLoop();
      return;
    }

    if (this.autoMotionLoopEnabled) {
      this._startAutoMotionLoop();
    } else {
      this._clearAutoMotionLoop();
      this._stopCurrentMotion('auto-motion-disabled');
    }
  },

  _pickDefaultMotionGroup(groups: Record<string, number>): string | null {
    const keys = Object.keys(groups).filter(key => groups[key] > 0);
    if (keys.length === 0) return null;

    const preferred = ['idle', 'home', 'stand', 'normal', 'default', 'main', 'loop', 'wait'];
    for (const key of keys) {
      const lower = key.toLowerCase();
      if (preferred.some(token => lower.includes(token))) {
        return key;
      }
    }

    if (keys.includes('')) {
      return '';
    }

    return null;
  },

  _startAutoMotionLoop(): void {
    this._clearAutoMotionLoop();
    if (!this.model) return;

    const initialGroups = this.getMotionGroups();
    const motionGroup = this._pickDefaultMotionGroup(initialGroups);
    const allGroupNames = Object.keys(initialGroups).filter(key => initialGroups[key] > 0);
    if (allGroupNames.length === 0) {
      log('当前模型未提供动作组，将保持静态显示');
      return;
    }

    const playOne = () => {
      if (!this.model) return;
      const groups = this.getMotionGroups();

      if (motionGroup !== null) {
        const count = groups[motionGroup] ?? 0;
        if (count <= 0) return;
        const idx = Math.floor(Math.random() * count);
        this.playMotion(motionGroup, idx);
        return;
      }

      const groupNames = Object.keys(groups).filter(key => groups[key] > 0);
      if (groupNames.length === 0) return;
      const randGroup = groupNames[Math.floor(Math.random() * groupNames.length)];
      const count = groups[randGroup];
      if (count <= 0) return;
      const randIndex = Math.floor(Math.random() * count);
      this.playMotion(randGroup, randIndex);
    };

    playOne();
    this._autoMotionTimer = window.setInterval(playOne, 10000);
    if (motionGroup !== null) {
      log('已启动自动动作循环', {
        mode: 'preferred-group',
        group: motionGroup || '(empty)',
        intervalMs: 10000,
      });
    } else {
      log('已启动自动动作循环', {
        mode: 'random-all-groups',
        groupCount: allGroupNames.length,
        intervalMs: 10000,
      });
    }
  },

  _stripJsonComments(text: string): string {
    let output = '';
    let inString = false;
    let quoteChar = '"';
    let escaping = false;
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = i + 1 < text.length ? text[i + 1] : '';

      if (inLineComment) {
        if (ch === '\n') {
          inLineComment = false;
          output += ch;
        }
        continue;
      }

      if (inBlockComment) {
        if (ch === '*' && next === '/') {
          inBlockComment = false;
          i++;
        }
        continue;
      }

      if (inString) {
        output += ch;
        if (escaping) {
          escaping = false;
        } else if (ch === '\\') {
          escaping = true;
        } else if (ch === quoteChar) {
          inString = false;
        }
        continue;
      }

      if (ch === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }

      if (ch === '/' && next === '*') {
        inBlockComment = true;
        i++;
        continue;
      }

      if (ch === '"' || ch === '\'') {
        inString = true;
        quoteChar = ch;
      }

      output += ch;
    }

    return output;
  },

  _tryParseModelJson(text: string): any | null {
    const raw = String(text ?? '').replace(/^\uFEFF/, '').trim();
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch {
      // ignore
    }

    let cleaned = this._stripJsonComments(raw);
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    cleaned = cleaned.replace(/}(\s*){/g, '},$1{');
    cleaned = cleaned.replace(/](\s*){/g, '],$1{');
    cleaned = cleaned.replace(/([}\]0-9"'])(\s*)(?="[^"]+"\s*:)/g, '$1,$2');

    try {
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  },

  _buildModelJsonCandidates(modelUrl: string): string[] {
    const candidates = [modelUrl];

    const addCandidate = (url: string) => {
      if (!url) return;
      if (!candidates.includes(url)) candidates.push(url);
    };

    addCandidate(modelUrl.replace(/\/model\.json(?=([?#].*)?$)/i, '/model.model.json'));
    addCandidate(modelUrl.replace(/\/model3\.json(?=([?#].*)?$)/i, '/model.model3.json'));

    return candidates;
  },

  async _fetchModelJsonCandidate(modelUrl: string, useProxy: boolean): Promise<any | null> {
    const requestUrl = useProxy ? this._getProxiedUrl(modelUrl) : modelUrl;
    const resp = await this._fetchWithTimeout(requestUrl, { method: 'GET', cache: 'no-store' }, 12000);
    if (!resp.ok) return null;

    const text = await resp.text();
    const modelJson = this._tryParseModelJson(text);
    if (!modelJson) return null;

    return { modelJson, sourceUrl: modelUrl, useProxy };
  },

  /**
   * 获取 CORS 代理 URL（兼容多种运行环境）
   * 依次尝试: getCorsProxyUrl -> enableCorsProxy -> corsProxy.getProxyUrl -> /proxy?url=
   */
  _getProxiedUrl(originalUrl: string): string {
    const top = this._top() as any;
    const url = String(originalUrl || '').trim();
    if (!url) return url;
    // 已经是代理 URL
    if (url.toLowerCase().includes('/proxy?url=')) return url;

    // SillyTavern 内置 CORS 代理函数
    if (typeof top.getCorsProxyUrl === 'function') {
      try {
        const proxied = top.getCorsProxyUrl(url);
        if (typeof proxied === 'string' && proxied) return proxied;
      } catch (_e) { /* ignore */ }
    }

    if (typeof top.enableCorsProxy === 'function') {
      try {
        const proxied = top.enableCorsProxy(url);
        if (typeof proxied === 'string' && proxied) return proxied;
      } catch (_e) { /* ignore */ }
    }

    if (top.corsProxy?.getProxyUrl) {
      try {
        const proxied = top.corsProxy.getProxyUrl(url);
        if (typeof proxied === 'string' && proxied) return proxied;
      } catch (_e) { /* ignore */ }
    }

    // 最终回退
    const origin = top.location?.origin;
    if (origin) {
      return `${origin}/proxy?url=${encodeURIComponent(url)}`;
    }

    return url;
  },

  /**
   * 初始化管理器（加载 SDK 并注册 Ticker）
   */
  async init(): Promise<boolean> {
    if (this.isReady) {
      const runtime = Live2DLoader.getRuntime(this._top());
      if (runtime) {
        this._runtime = runtime;
        return true;
      }
      this.isReady = false;
    }

    const sdkLoaded = await Live2DLoader.load();
    if (!sdkLoaded) {
      error('SDK 加载失败，无法初始化 Live2DManager');
      return false;
    }

    // 等待桌面宠物专属 runtime 就绪，避免与其他插件混用
    let runtime = Live2DLoader.getRuntime(this._top());
    let retries = 30;
    while (!runtime && retries > 0) {
      await new Promise(r => setTimeout(r, 100));
      runtime = Live2DLoader.getRuntime(this._top());
      retries--;
    }

    if (!runtime?.pixi || !runtime?.live2dModel) {
      error('桌面宠物 Live2D runtime 未就绪');
      return false;
    }

    try {
      const PIXI = runtime.pixi;
      const Live2DModel = runtime.live2dModel;
      if (typeof Live2DModel?.registerTicker !== 'function') {
        throw new Error('Live2DModel.registerTicker 不可用');
      }

      // 防止脚本重载后重复注册 ticker，导致动画速度叠加
      const lastRegisteredTicker = (Live2DModel as any)[TICKER_REGISTERED_FLAG] as unknown;
      if (lastRegisteredTicker !== PIXI.Ticker) {
        Live2DModel.registerTicker(PIXI.Ticker);
        (Live2DModel as any)[TICKER_REGISTERED_FLAG] = PIXI.Ticker;
        log('Live2D ticker 注册完成');
      } else {
        log('Live2D ticker 已注册，跳过重复注册');
      }

      this._runtime = runtime;
      this.isReady = true;
      log('Live2DManager 初始化完成');
      return true;
    } catch (e) {
      error('Live2DManager 初始化失败', e);
      return false;
    }
  },

  /**
   * 从远程 URL 加载模型。
   * 核心流程：拉取 model JSON -> 重写相对资源路径 -> 生成 data URL -> 交给 Live2DModel.from。
   */
  async loadModel(
    modelPath: string,
    onProgress?: (progress: ModelLoadProgress) => void,
  ): Promise<boolean> {
    let progress = 0;
    const reportProgress = (percent: number, message: string): void => {
      if (!onProgress) return;
      progress = Math.max(progress, Math.round(percent));
      onProgress({
        percent: Math.max(0, Math.min(100, progress)),
        message,
      });
    };

    reportProgress(2, '准备加载模型');
    if (!this.isReady) {
      reportProgress(8, '初始化 Live2D 引擎');
      const ready = await this.init();
      if (!ready) {
        reportProgress(100, 'Live2D 引擎初始化失败');
        return false;
      }
    }

    const runtime = Live2DLoader.getRuntime(this._top()) ?? this._runtime;
    const PIXI = runtime?.pixi ?? this._getPIXI();
    const Live2DModel = runtime?.live2dModel ?? PIXI?.live2d?.Live2DModel;
    if (!PIXI || !Live2DModel) {
      reportProgress(100, 'Live2D 运行时缺失');
      error('Live2D 运行时缺失，无法加载模型');
      return false;
    }

    reportProgress(12, '解析模型地址');
    // 构建完整 URL
    let modelUrl: string;
    if (modelPath.startsWith('http://') || modelPath.startsWith('https://')) {
      modelUrl = modelPath;
    } else {
      modelUrl = `${LIVE2D_CDN_BASE}${modelPath}`;
    }

    modelUrl = this._normalizeRemoteUrl(modelUrl);

    try {
      log('开始加载模型:', modelPath);
      reportProgress(18, '清理旧模型');

      // 销毁旧模型
      this.destroyModel();

      const modelUrlCandidates = this._buildModelUrlCandidates(modelUrl);
      let model: any = null;
      let texturesReady = false;
      let loadedFromUrl = modelUrl;
      let lastError: unknown = null;

      for (let i = 0; i < modelUrlCandidates.length; i++) {
        const candidateUrl = modelUrlCandidates[i];
        let attemptModel: any = null;
        let attemptTexturesReady = false;
        const attemptLabel = modelUrlCandidates.length > 1
          ? ` (${i + 1}/${modelUrlCandidates.length})`
          : '';
        const attemptProgressStart = 24 + Math.floor((i / modelUrlCandidates.length) * 38);

        try {
          if (i > 0) {
            log('主地址加载失败，尝试镜像地址:', candidateUrl);
          }

          reportProgress(attemptProgressStart, `下载模型配置${attemptLabel}`);
          const dataUrl = await this._buildRemoteModelDataUrl(candidateUrl);
          reportProgress(attemptProgressStart + 12, `实例化模型${attemptLabel}`);
          try {
            attemptModel = await this._createModelWithTimeout(Live2DModel, dataUrl);
          } catch (fromError) {
            warn('首次实例化模型失败，尝试强制代理资源重试', fromError);
            reportProgress(attemptProgressStart + 16, `实例化失败，代理重试${attemptLabel}`);
            const proxyDataUrl = await this._buildRemoteModelDataUrl(candidateUrl, true);
            attemptModel = await this._createModelWithTimeout(Live2DModel, proxyDataUrl);
            log('强制代理资源重试后模型实例化成功');
          }

          reportProgress(attemptProgressStart + 22, `加载模型纹理${attemptLabel}`);
          attemptTexturesReady = await this._waitForTextures(attemptModel, (loadedCount, totalCount) => {
            if (totalCount <= 0) {
              return;
            }
            const textureRatio = Math.max(0, Math.min(1, loadedCount / totalCount));
            const textureProgress = attemptProgressStart + 22 + textureRatio * 14;
            reportProgress(textureProgress, `加载模型纹理 ${loadedCount}/${totalCount}${attemptLabel}`);
          });
          if (!attemptTexturesReady) {
            warn('纹理未完全加载，尝试通过代理重试模型资源');
            reportProgress(attemptProgressStart + 36, `纹理补载重试${attemptLabel}`);
            try {
              const proxyDataUrl = await this._buildRemoteModelDataUrl(candidateUrl, true);
              const proxyModel = await this._createModelWithTimeout(Live2DModel, proxyDataUrl);
              const proxyTexturesReady = await this._waitForTextures(proxyModel, (loadedCount, totalCount) => {
                if (totalCount <= 0) {
                  return;
                }
                const textureRatio = Math.max(0, Math.min(1, loadedCount / totalCount));
                const textureProgress = attemptProgressStart + 36 + textureRatio * 8;
                reportProgress(textureProgress, `代理纹理补载 ${loadedCount}/${totalCount}${attemptLabel}`);
              });
              if (proxyTexturesReady) {
                try {
                  attemptModel.destroy();
                } catch {
                  // ignore
                }
                attemptModel = proxyModel;
                attemptTexturesReady = true;
                log('代理重试后纹理加载成功');
              } else {
                warn('代理重试后纹理仍未完全加载，继续使用首次加载结果');
                try {
                  proxyModel.destroy();
                } catch {
                  // ignore
                }
              }
            } catch (retryError) {
              warn('代理重试加载失败，继续使用首次加载结果', retryError);
            }
          }

          if (!attemptTexturesReady) {
            const hasNextCandidate = i < modelUrlCandidates.length - 1;
            if (hasNextCandidate) {
              warn('纹理仍未完全加载，将尝试备用地址:', candidateUrl);
              reportProgress(attemptProgressStart + 44, `纹理加载失败，切换备用地址${attemptLabel}`);
              throw new Error('纹理加载失败，尝试备用地址');
            }
            warn('纹理仍未完全加载，且已无备用地址可尝试，模型可能不可见');
          }

          model = attemptModel;
          texturesReady = attemptTexturesReady;
          loadedFromUrl = candidateUrl;
          lastError = null;
          break;
        } catch (attemptError) {
          lastError = attemptError;
          warn(`模型地址尝试失败 (${i + 1}/${modelUrlCandidates.length})`, candidateUrl, attemptError);
          try {
            attemptModel?.destroy?.();
          } catch {
            // ignore
          }
        }
      }

      if (!model) {
        throw (lastError instanceof Error ? lastError : new Error('模型加载失败'));
      }

      this.model = model;
      const measuredBounds = this._readModelBaseBounds(model);
      if (measuredBounds) {
        this.modelBaseBounds = measuredBounds;
        this.modelBaseWidth = measuredBounds.width;
        this.modelBaseHeight = measuredBounds.height;
      } else {
        this.modelBaseBounds = null;
        this.modelBaseWidth = model.width > 0 ? model.width : 500;
        this.modelBaseHeight = model.height > 0 ? model.height : 800;
      }
      reportProgress(95, '整理模型数据');
      log('模型表情统计', this.getExpressions());
      log('模型动作组统计', this.getMotionGroups());
      if (!texturesReady) {
        warn('模型已挂载，但纹理可能未完全可用');
      }
      if (loadedFromUrl !== modelUrl) {
        log('模型已通过镜像地址加载:', loadedFromUrl);
      }
      reportProgress(100, '模型加载完成');
      log('模型加载成功');
      return true;
    } catch (e) {
      reportProgress(100, '模型加载失败');
      error('模型加载失败:', e);
      return false;
    }
  },

  /**
   * 获取远程 model JSON，并把所有相对资源路径转换为可访问的绝对 URL。
   * 之后将 JSON 转为 data URL 返回。
   */
  async _buildRemoteModelDataUrl(modelUrl: string, forceProxyResources = false): Promise<string> {
    const candidateUrls = this._buildModelJsonCandidates(modelUrl);

    let modelJson: any = null;
    let sourceModelUrl = modelUrl;
    let useProxy = false;

    for (const candidateUrl of candidateUrls) {
      try {
        const direct = await this._fetchModelJsonCandidate(candidateUrl, false);
        if (direct) {
          modelJson = direct.modelJson;
          sourceModelUrl = direct.sourceUrl;
          useProxy = false;
          break;
        }
      } catch (directError) {
        warn('直连获取模型 JSON 失败，尝试代理：', candidateUrl, directError);
      }

      try {
        const proxied = await this._fetchModelJsonCandidate(candidateUrl, true);
        if (proxied) {
          modelJson = proxied.modelJson;
          sourceModelUrl = proxied.sourceUrl;
          useProxy = true;
          break;
        }
      } catch (proxyError) {
        warn('代理获取模型 JSON 失败：', candidateUrl, proxyError);
      }
    }

    if (!modelJson) {
      throw new Error('模型 JSON 解析失败');
    }

    if (sourceModelUrl !== modelUrl) {
      log('主模型 JSON 解析失败，已回退到:', sourceModelUrl);
    }

    const modifiedModelJson = JSON.parse(JSON.stringify(modelJson));
    this._normalizeLegacyCubism2Settings(modifiedModelJson);

    // 将相对路径解析为绝对 URL（必要时套代理）
    const resolveUrl = (p: string): string => {
      if (typeof p !== 'string') return p;
      const raw = p.trim();
      if (!raw) return p;

      const normalized = this._normalizeResourceRef(raw);
      const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(normalized);
      const abs = hasScheme
        ? this._normalizeRemoteUrl(normalized)
        : this._normalizeRemoteUrl(new URL(normalized, sourceModelUrl).toString());

      if ((useProxy || forceProxyResources) && (abs.startsWith('http://') || abs.startsWith('https://'))) {
        return this._getProxiedUrl(abs);
      }
      return abs;
    };

    // 改写 Cubism 3/4 model3.json
    if (modifiedModelJson?.FileReferences) {
      const refs = modifiedModelJson.FileReferences;
      for (const key of Object.keys(refs)) {
        if (typeof refs[key] === 'string') {
          refs[key] = resolveUrl(refs[key]);
        }
      }

      if (typeof refs.Moc === 'string') refs.Moc = resolveUrl(refs.Moc);
      if (Array.isArray(refs.Textures)) refs.Textures = refs.Textures.map(resolveUrl);
      if (typeof refs.Physics === 'string') refs.Physics = resolveUrl(refs.Physics);
      if (typeof refs.Pose === 'string') refs.Pose = resolveUrl(refs.Pose);
      if (typeof refs.UserData === 'string') refs.UserData = resolveUrl(refs.UserData);

      if (refs.Motions && typeof refs.Motions === 'object') {
        for (const groupName of Object.keys(refs.Motions)) {
          const motionList = refs.Motions[groupName];
          if (!Array.isArray(motionList)) continue;
          for (const motionDef of motionList) {
            if (!motionDef || typeof motionDef !== 'object') continue;
            if (typeof motionDef.File === 'string') motionDef.File = resolveUrl(motionDef.File);
            if (typeof motionDef.Sound === 'string') motionDef.Sound = resolveUrl(motionDef.Sound);
          }
        }
      }

      if (Array.isArray(refs.Expressions)) {
        for (const exprDef of refs.Expressions) {
          if (!exprDef || typeof exprDef !== 'object') continue;
          if (typeof exprDef.File === 'string') exprDef.File = resolveUrl(exprDef.File);
        }
      }
    } else {
      // 改写 Cubism 2.1 model.json
      if (typeof modifiedModelJson.model === 'string') {
        modifiedModelJson.model = resolveUrl(modifiedModelJson.model);
      } else if (typeof modifiedModelJson.Model === 'string') {
        modifiedModelJson.Model = resolveUrl(modifiedModelJson.Model);
      }

      const textures = modifiedModelJson.textures || modifiedModelJson.Textures;
      if (Array.isArray(textures)) {
        for (let i = 0; i < textures.length; i++) {
          if (typeof textures[i] === 'string') textures[i] = resolveUrl(textures[i]);
        }
      }

      if (typeof modifiedModelJson.physics === 'string') modifiedModelJson.physics = resolveUrl(modifiedModelJson.physics);
      if (typeof modifiedModelJson.Physics === 'string') modifiedModelJson.Physics = resolveUrl(modifiedModelJson.Physics);
      if (typeof modifiedModelJson.pose === 'string') modifiedModelJson.pose = resolveUrl(modifiedModelJson.pose);
      if (typeof modifiedModelJson.Pose === 'string') modifiedModelJson.Pose = resolveUrl(modifiedModelJson.Pose);

      const motions = modifiedModelJson.motions || modifiedModelJson.Motions;
      if (motions && typeof motions === 'object') {
        for (const groupName of Object.keys(motions)) {
          const motionList = motions[groupName];
          if (!Array.isArray(motionList)) continue;
          for (const motionDef of motionList) {
            if (!motionDef || typeof motionDef !== 'object') continue;
            if (typeof motionDef.file === 'string') motionDef.file = resolveUrl(motionDef.file);
            if (typeof motionDef.File === 'string') motionDef.File = resolveUrl(motionDef.File);
            if (typeof motionDef.sound === 'string') motionDef.sound = resolveUrl(motionDef.sound);
            if (typeof motionDef.Sound === 'string') motionDef.Sound = resolveUrl(motionDef.Sound);
          }
        }
      }

      const expressions = modifiedModelJson.expressions || modifiedModelJson.Expressions;
      if (Array.isArray(expressions)) {
        for (const exprDef of expressions) {
          if (!exprDef || typeof exprDef !== 'object') continue;
          if (typeof exprDef.file === 'string') exprDef.file = resolveUrl(exprDef.file);
          if (typeof exprDef.File === 'string') exprDef.File = resolveUrl(exprDef.File);
        }
      }
    }

    // 缓存最终的 model json（用于在运行时无法枚举表情/动作时兜底展示）
    this._lastModelJson = modifiedModelJson;
    this._lastModelJsonSourceUrl = sourceModelUrl;

    // 转为 data URL
    const modelJsonStr = JSON.stringify(modifiedModelJson);
    const modelJsonBase64 = btoa(unescape(encodeURIComponent(modelJsonStr)));
    return `data:application/json;base64,${modelJsonBase64}`;
  },

  /**
   * 将模型挂载到 PIXI 舞台
   */
  mountToStage(stageWidth: number, stageHeight: number, scale: number): void {
    if (!this.model) return;

    const stage = Live2DStage.getStage();
    if (!stage) return;

    // 清空舞台
    while (stage.children.length > 0) {
      stage.removeChildAt(0);
    }

    const transform = this._applyStageTransform(stageWidth, stageHeight, scale);
    if (!transform) return;

    stage.addChild(this.model);

    try {
      if ('autoUpdate' in this.model) {
        (this.model as any).autoUpdate = true;
      }
    } catch {
      // ignore
    }

    log('模型已挂载到舞台', {
      stageWidth: transform.stageWidth,
      stageHeight: transform.stageHeight,
      scale: transform.finalScale,
      modelWidth: transform.modelWidth,
      modelHeight: transform.modelHeight,
    });

    // 一些模型没有默认 idle，需要主动触发动作才会“动起来”
    if (this.autoMotionLoopEnabled) {
      this._startAutoMotionLoop();
    } else {
      this._clearAutoMotionLoop();
    }
  },

  /**
   * 更新模型缩放
   */
  updateScale(stageWidth: number, stageHeight: number, scale: number): void {
    if (!this.model) return;
    this._applyStageTransform(stageWidth, stageHeight, scale);
  },

  /**
   * 获取模型原始尺寸（未应用外部缩放）
   */
  _getModelBaseSize(): { width: number; height: number } {
    if (this.modelBaseBounds) {
      return {
        width: this.modelBaseBounds.width,
        height: this.modelBaseBounds.height,
      };
    }

    if (this.modelBaseWidth && this.modelBaseHeight) {
      return {
        width: this.modelBaseWidth,
        height: this.modelBaseHeight,
      };
    }

    if (!this.model) {
      return { width: 500, height: 800 };
    }

    const scaleX = this.model.scale?.x || 1;
    const scaleY = this.model.scale?.y || 1;
    const width = this.model.width > 0 && scaleX !== 0 ? this.model.width / scaleX : 500;
    const height = this.model.height > 0 && scaleY !== 0 ? this.model.height / scaleY : 800;

    return { width, height };
  },

  /**
   * 获取可用表情列表
   */
  getExpressions(): string[] {
    if (!this.model) return [];
    try {
      const names = collectExpressionNames(this.model);
      if (names.length > 0) return names;

      const cached = this._lastModelJson;
      if (cached) {
        const fallbackNames = collectExpressionNamesFromUnknown(cached);
        if (fallbackNames.length > 0) return fallbackNames;
      }

      return [];
    } catch (e) {
      warn('获取表情列表失败', e);
      return [];
    }
  },

  /**
   * 获取可用动作组列表
   */
  getMotionGroups(): Record<string, number> {
    const groups: Record<string, number> = {};
    if (!this.model) return groups;

    const mergeGroupMap = (source: Record<string, number> | null | undefined): void => {
      if (!source || typeof source !== 'object') return;
      for (const [name, count] of Object.entries(source)) {
        const keyRaw = String(name ?? '');
        const keyTrimmed = keyRaw.trim();
        if (!keyTrimmed && keyRaw !== '') continue;
        const groupName = keyTrimmed || '';
        const parsedCount = Number(count);
        const safeCount = Number.isFinite(parsedCount) && parsedCount > 0 ? Math.max(1, Math.floor(parsedCount)) : 1;
        const prev = groups[groupName];
        groups[groupName] = Number.isFinite(prev) && prev > 0 ? Math.max(prev, safeCount) : safeCount;
      }
    };

    const motionManager = this.model?.internalModel?.motionManager as any;
    const defs = motionManager?.definitions;
    if (defs && typeof defs === 'object') {
      for (const [group, motions] of Object.entries(defs)) {
        if (Array.isArray(motions)) {
          groups[group] = motions.length;
        }
      }
    }

    try {
      const groupNames = collectMotionGroupNames(this.model);
      for (const groupName of groupNames) {
        if (!Object.prototype.hasOwnProperty.call(groups, groupName)) {
          groups[groupName] = 1;
        } else if (!Number.isFinite(groups[groupName]) || groups[groupName] <= 0) {
          groups[groupName] = 1;
        }
      }
    } catch (e) {
      warn('获取动作组列表失败', e);
    }

    try {
      mergeGroupMap(collectMotionGroupCountsFromUnknown(this.model?.internalModel?.settings));
      mergeGroupMap(collectMotionGroupCountsFromUnknown(this.model?.internalModel?.motionManager?.settings));
    } catch (e) {
      warn('动作组运行时补充解析失败', e);
    }

    try {
      const cached = this._lastModelJson;
      if (cached) {
        mergeGroupMap(collectMotionGroupCountsFromUnknown(cached));
      }
    } catch (e) {
      warn('动作组兜底解析失败', e);
    }
    return groups;
  },

  /**
   * 获取可用的动作条目列表（包含动作名 + 对应的 group/index）
   */
  getMotions(): Live2DMotionEntry[] {
    if (!this.model) return [];

    try {
      const merged: Live2DMotionEntry[] = [];
      const seen = new Set<string>();

      const pushAll = (items: Live2DMotionEntry[]) => {
        for (const item of Array.isArray(items) ? items : []) {
          const group = String(item?.group ?? '');
          const indexRaw = Number(item?.index);
          const index = Number.isFinite(indexRaw) ? Math.max(0, Math.floor(indexRaw)) : 0;
          const name = String(item?.name ?? '').trim();
          if (!name) continue;
          const key = `${group}#${index}#${name.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push({ group, index, name });
        }
      };

      pushAll(collectMotionEntries(this.model));

      const cached = this._lastModelJson;
      if (cached) {
        const cachedAny = cached as any;
        const motionsContainer =
          cachedAny?.FileReferences?.Motions ?? cachedAny?.Motions ?? cachedAny?.motions ?? null;
        if (motionsContainer) {
          pushAll(
            collectMotionEntries({
              internalModel: { motionManager: { definitions: motionsContainer }, settings: cached },
            } as any),
          );
        }
      }

      return merged;
    } catch (e) {
      warn('获取动作列表失败', e);
      return [];
    }
  },

  /**
   * 播放表情
   */
  playExpression(name?: string): void {
    if (!this.model) return;
    try {
      if (name) {
        this.model.expression(name);
      } else {
        const expressions = this.getExpressions();
        if (expressions.length > 0) {
          const idx = Math.floor(Math.random() * expressions.length);
          this.model.expression(expressions[idx]);
        }
      }
    } catch (e) {
      warn('播放表情失败:', e);
    }
  },

  /**
   * 播放动作
   */
  playMotion(group?: string, index?: number): void {
    if (!this.model) return;
    try {
      const runMotion = (groupName: string, motionIndex: number) => {
        try {
          this.model.motion(groupName, motionIndex);
          return;
        } catch (firstError) {
          const mm = this.model?.internalModel?.motionManager as any;
          if (typeof mm?.startMotion === 'function') {
            mm.startMotion(groupName, motionIndex, 3);
            return;
          }
          if (typeof mm?.startRandomMotion === 'function') {
            mm.startRandomMotion(groupName, 3);
            return;
          }
          throw firstError;
        }
      };

      // 允许空字符串动作组（部分模型的 motions key 为 ""）
      if (typeof group === 'string') {
        runMotion(group, index ?? 0);
      } else {
        const groups = this.getMotionGroups();
        const groupNames = Object.keys(groups);
        if (groupNames.length > 0) {
          const randGroup = groupNames[Math.floor(Math.random() * groupNames.length)];
          const count = groups[randGroup];
          const randIndex = Math.floor(Math.random() * count);
          runMotion(randGroup, randIndex);
        }
      }
    } catch (e) {
      warn('播放动作失败:', e);
    }
  },

  /**
   * 播放随机表情和动作
   */
  playRandomAnimation(): void {
    this.playExpression();
    this.playMotion();
  },

  /**
   * 根据窗口 client 坐标驱动视线跟随。
   * 在不支持 focus 的模型上保持 no-op。
   */
  focusByClientPoint(clientX: number, clientY: number, immediate = false): void {
    const model = this.model;
    if (!model) return;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

    try {
      if (typeof model.focus === 'function') {
        model.focus(clientX, clientY, immediate);
        return;
      }
    } catch {
      return;
    }

    try {
      const controller = model?.internalModel?.focusController;
      if (!controller || typeof controller.focus !== 'function') return;

      const rect = Live2DStage.container?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;

      const normalizedX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const normalizedY = ((clientY - rect.top) / rect.height) * 2 - 1;
      controller.focus(
        Math.max(-1, Math.min(1, normalizedX)),
        Math.max(-1, Math.min(1, -normalizedY)),
        immediate,
      );
    } catch {
      // ignore
    }
  },

  /**
   * 将视线回正到舞台中心。
   */
  focusCenter(immediate = true): void {
    const model = this.model;
    if (!model) return;

    const rect = Live2DStage.container?.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      this.focusByClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, immediate);
      return;
    }

    try {
      const controller = model?.internalModel?.focusController;
      if (!controller || typeof controller.focus !== 'function') return;
      controller.focus(0, 0, immediate);
    } catch {
      // ignore
    }
  },

  /**
   * 设置口型开合（用于 TTS 口型同步）
   * - 完全参考 galgame 通用生成器的 Live2DManager.setMouthOpen
   * - 桌面宠物仅有一个 model，因此忽略 characterId 参数
   */
  setMouthOpen(_characterId: string, value: number): boolean {
    const model = this.model;
    if (!model?.internalModel?.coreModel) return false;

    const coreModel = model.internalModel.coreModel;
    const clampedValue = Math.max(0, Math.min(1, value));
    this._mouthCurrentValue = clampedValue;
    const topAny = this._top() as any;
    const logPrefix = '[酒馆桌面宠物] LipSync参数';
    this._ensureLipSyncHooks(model);
    this._installCoreWriteMask(coreModel);

    const getParamRange = (paramId: string, paramIndex: number): { min: number; max: number } => {
      let min = Number.NaN;
      let max = Number.NaN;

      const readNumber = (v: any): number => {
        const n = Number(v);
        return Number.isFinite(n) ? n : Number.NaN;
      };

      if (Number.isFinite(paramIndex) && paramIndex >= 0) {
        try {
          if (typeof coreModel.getParameterMinimumValue === 'function') {
            min = readNumber(coreModel.getParameterMinimumValue(paramIndex));
          }
        } catch {
          // ignore
        }
        try {
          if (typeof coreModel.getParameterMaximumValue === 'function') {
            max = readNumber(coreModel.getParameterMaximumValue(paramIndex));
          }
        } catch {
          // ignore
        }
      }

      if (!Number.isFinite(min)) {
        try {
          if (typeof coreModel.getParamMin === 'function') {
            min = readNumber(coreModel.getParamMin(paramId));
          }
        } catch {
          // ignore
        }
      }
      if (!Number.isFinite(max)) {
        try {
          if (typeof coreModel.getParamMax === 'function') {
            max = readNumber(coreModel.getParamMax(paramId));
          }
        } catch {
          // ignore
        }
      }

      if (!Number.isFinite(min)) min = 0;
      if (!Number.isFinite(max) || max <= min) max = 1;
      return { min, max };
    };

    const mapToParamValue = (paramId: string, paramIndex: number): number => {
      const { min, max } = getParamRange(paramId, paramIndex);
      // 对于 [-x, +x] 区间，口型从 0 开始往正向开合；否则按全区间映射。
      if (min < 0 && max > 0) {
        return clampedValue * max;
      }
      return min + (max - min) * clampedValue;
    };

    const getIndexById = (paramId: string): number => {
      try {
        if (typeof coreModel.getParameterIndex === 'function') {
          return coreModel.getParameterIndex(paramId);
        }
      } catch {
        // ignore
      }
      try {
        if (typeof coreModel.getParamIndex === 'function') {
          return coreModel.getParamIndex(paramId);
        }
      } catch {
        // ignore
      }
      return -1;
    };

    const applyById = (paramId: string): boolean => {
      const paramIndex = getIndexById(paramId);
      const mappedValue = mapToParamValue(paramId, paramIndex);
      try {
        if (typeof coreModel.setParameterValueById === 'function') {
          coreModel.setParameterValueById(paramId, mappedValue, 1);
          return true;
        }
      } catch {
        // ignore
      }
      try {
        if (typeof coreModel.addParameterValueById === 'function') {
          coreModel.addParameterValueById(paramId, mappedValue, 1);
          return true;
        }
      } catch {
        // ignore
      }
      try {
        if (typeof coreModel.setParamFloat === 'function') {
          coreModel.setParamFloat(paramId, mappedValue, 1);
          return true;
        }
      } catch {
        // ignore
      }
      try {
        if (typeof coreModel.addParamFloat === 'function') {
          coreModel.addParamFloat(paramId, mappedValue, 1);
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };

    const applyByIndex = (paramIndex: number): boolean => {
      if (!Number.isFinite(paramIndex) || paramIndex < 0) return false;
      const paramId = (() => {
        try {
          if (typeof coreModel.getParameterId === 'function') {
            return String(coreModel.getParameterId(paramIndex) || '');
          }
        } catch {
          // ignore
        }
        return '';
      })();
      const mappedValue = mapToParamValue(paramId || `__idx_${paramIndex}`, paramIndex);
      try {
        if (typeof coreModel.setParameterValueByIndex === 'function') {
          coreModel.setParameterValueByIndex(paramIndex, mappedValue, 1);
          return true;
        }
      } catch {
        // ignore
      }
      try {
        if (typeof coreModel.addParameterValueByIndex === 'function') {
          coreModel.addParameterValueByIndex(paramIndex, mappedValue, 1);
          return true;
        }
      } catch {
        // ignore
      }
      try {
        if (typeof coreModel.setParameterValue === 'function') {
          coreModel.setParameterValue(paramIndex, mappedValue, 1);
          return true;
        }
      } catch {
        // ignore
      }
      try {
        if (typeof coreModel.addParameterValue === 'function') {
          coreModel.addParameterValue(paramIndex, mappedValue, 1);
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };

    const paramNames = [
      'ParamMouthOpenY',
      'PARAM_MOUTH_OPEN_Y',
      'ParamMouthOpen',
      'ParamA',
      'Param58',
      'Param61',
      'Param_Mouth_Open',
      'mouth_open',
    ];

    let appliedAny = false;
    if (this._manualMouthParamEnabled && this._manualMouthParamIds.length > 0) {
      for (const manualId of this._manualMouthParamIds) {
        const idx = getIndexById(manualId);
        if (applyById(manualId)) appliedAny = true;
        if (applyByIndex(idx)) appliedAny = true;
      }
    }

    const visited = new Set<string>();
    for (const paramName of paramNames) {
      if (visited.has(paramName)) continue;
      visited.add(paramName);
      const paramIndex = getIndexById(paramName);
      if (paramIndex >= 0) {
        if (applyById(paramName)) appliedAny = true;
        if (applyByIndex(paramIndex)) appliedAny = true;
      }
    }
    if (appliedAny) return true;

    // 缓存探测：按模型真实参数名自动匹配 mouth/lip/ParamA
    if (this._mouthParamCore !== coreModel) {
      this._mouthParamCore = coreModel;
      this._mouthParamIds = [];
      this._mouthParamIndexes = [];
      this._mouthParamRangeMins = [];
      this._mouthParamRangeMaxs = [];
      this._mouthParamWarned = false;
      try {
        if (typeof coreModel.getParameterCount === 'function' && typeof coreModel.getParameterId === 'function') {
          const count = Number(coreModel.getParameterCount()) || 0;
          const numericFallback: Array<{ id: string; idx: number; min: number; max: number }> = [];
          for (let i = 0; i < count; i++) {
            const pid = String(coreModel.getParameterId(i) || '');
            const low = pid.toLowerCase();
            const range = getParamRange(pid, i);
            if (low.includes('mouth') || low.includes('lip') || pid === 'ParamA') {
              this._mouthParamIds.push(pid);
              this._mouthParamIndexes.push(i);
              this._mouthParamRangeMins.push(range.min);
              this._mouthParamRangeMaxs.push(range.max);
              continue;
            }

            // Cubism2 常见数字参数（如 Param58/Param61）作为最后回退。
            if (/^param\d+$/i.test(pid) && range.max >= 8 && range.min >= -1) {
              numericFallback.push({ id: pid, idx: i, min: range.min, max: range.max });
            }
          }

          if (this._mouthParamIds.length === 0 && numericFallback.length > 0) {
            numericFallback.sort((a, b) => b.max - a.max);
            const picked = numericFallback.slice(0, 3);
            for (const item of picked) {
              this._mouthParamIds.push(item.id);
              this._mouthParamIndexes.push(item.idx);
              this._mouthParamRangeMins.push(item.min);
              this._mouthParamRangeMaxs.push(item.max);
            }
            try {
              topAny?.console?.log?.(`${logPrefix}: 使用数字参数回退`, picked);
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
    }

    for (let i = 0; i < this._mouthParamIds.length; i++) {
      const pid = this._mouthParamIds[i];
      const pidx = this._mouthParamIndexes[i] ?? -1;
      if (applyById(pid)) appliedAny = true;
      if (applyByIndex(pidx)) appliedAny = true;
    }
    if (appliedAny) return true;

    if (!this._mouthParamWarned) {
      this._mouthParamWarned = true;
      const msg = `${logPrefix}: 未找到可用口型参数`;
      try {
        topAny?.console?.warn?.(msg, {
          presetCandidates: paramNames,
          scannedIds: this._mouthParamIds,
        });
      } catch {
        // ignore
      }
    }

    return false;
  },

  _isMouthParam(paramIdOrIndex: string | number, coreModel: any): boolean {
    const preset = [
      'parammouthopeny',
      'param_mouth_open_y',
      'parammouthopen',
      'parama',
      'param58',
      'param61',
      'param_mouth_open',
      'mouth_open',
    ];

    if (typeof paramIdOrIndex === 'number') {
      if (this._mouthParamIndexes.includes(paramIdOrIndex)) return true;
      try {
        if (typeof coreModel?.getParameterId === 'function') {
          const pid = String(coreModel.getParameterId(paramIdOrIndex) || '').trim();
          if (pid) return this._isMouthParam(pid, coreModel);
        }
      } catch {
        // ignore
      }
      return false;
    }

    const id = String(paramIdOrIndex || '').trim().toLowerCase();
    if (!id) return false;

    if (this._manualMouthParamEnabled && this._manualMouthParamIdSet.size > 0) {
      if (this._manualMouthParamIdSet.has(id)) return true;
    }

    if (preset.includes(id)) return true;

    return this._mouthParamIds.some(pid => String(pid || '').trim().toLowerCase() === id);
  },

  _installCoreWriteMask(coreModel: any): void {
    if (!coreModel) return;
    if (this._writeMaskCore === coreModel) return;

    if (this._writeMaskRestore) {
      try {
        this._writeMaskRestore();
      } catch {
        // ignore
      }
      this._writeMaskCore = null;
      this._writeMaskRestore = null;
    }

    const restoreEntries: Array<{ method: string; raw: any }> = [];
    const methods = [
      'setParameterValueById',
      'addParameterValueById',
      'setParamFloat',
      'addParamFloat',
      'setParameterValueByIndex',
      'addParameterValueByIndex',
      'setParameterValue',
      'addParameterValue',
    ];

    const getParamRef = (method: string, args: any[]): string | number | null => {
      if (!Array.isArray(args) || args.length === 0) return null;
      const first = args[0];
      if (method.includes('ById') || method === 'setParamFloat' || method === 'addParamFloat') {
        return typeof first === 'string' ? first : null;
      }
      if (method.includes('ByIndex')) {
        return typeof first === 'number' ? first : null;
      }
      if (method === 'setParameterValue' || method === 'addParameterValue') {
        if (typeof first === 'number' || typeof first === 'string') return first;
      }
      return null;
    };

    for (const method of methods) {
      const raw = coreModel?.[method];
      if (typeof raw !== 'function') continue;
      restoreEntries.push({ method, raw });
      coreModel[method] = (...args: any[]) => {
        const paramRef = getParamRef(method, args);
        if (
          paramRef !== null &&
          this._lipSyncActive &&
          this._inModelUpdate &&
          this._isMouthParam(paramRef, coreModel)
        ) {
          return undefined;
        }
        return raw.apply(coreModel, args);
      };
    }

    this._writeMaskCore = coreModel;
    this._writeMaskRestore = () => {
      for (const entry of restoreEntries) {
        try {
          coreModel[entry.method] = entry.raw;
        } catch {
          // ignore
        }
      }
    };
  },

  _ensureLipSyncHooks(model: any): void {
    if (!model) return;
    if (this._updateHookModel === model) return;

    if (this._updateHookRestore) {
      try {
        this._updateHookRestore();
      } catch {
        // ignore
      }
      this._updateHookRestore = null;
      this._updateHookModel = null;
    }

    const internal = model?.internalModel;
    const updater = internal?.update;
    if (typeof updater !== 'function') return;

    const rawUpdate = updater.bind(internal);
    const self = this;
    internal.update = function (...args: any[]) {
      self._inModelUpdate = true;
      let ret: any;
      try {
        ret = rawUpdate(...args);
      } finally {
        self._inModelUpdate = false;
        if (self._lipSyncActive) {
          try {
            self._applyMouthValueToModel(model);
          } catch {
            // ignore
          }
        }
      }
      return ret;
    };

    this._updateHookModel = model;
    this._updateHookRestore = () => {
      try {
        internal.update = updater;
      } catch {
        // ignore
      }
    };
  },

  _applyMouthValueToModel(model: any): boolean {
    if (!model?.internalModel?.coreModel) return false;
    const targetValue = Math.max(0, Math.min(1, this._mouthCurrentValue || 0));
    const oldValue = this._mouthCurrentValue;
    this._mouthCurrentValue = targetValue;
    const applied = this.setMouthOpen('__mouth_hook__', targetValue);
    this._mouthCurrentValue = oldValue;
    return applied;
  },

  _getMouthParamSource(): 'manual' | 'auto' {
    if (this._manualMouthParamEnabled && this._manualMouthParamIdSet.size > 0) {
      return 'manual';
    }
    return 'auto';
  },

  getLipSyncDebugInfo(): {
    lipSyncOverride: 'active' | 'inactive';
    mouthParamsSource: 'manual' | 'auto';
    mouthParamsCount: number;
  } {
    this._refreshManualMouthParams();
    const source = this._getMouthParamSource();
    const count = source === 'manual' ? this._manualMouthParamIdSet.size : this._mouthParamIds.length;
    return {
      lipSyncOverride: this._lipSyncActive ? 'active' : 'inactive',
      mouthParamsSource: source,
      mouthParamsCount: count,
    };
  },

  /**
   * 销毁模型
   */
  destroyModel(): void {
    this._clearAutoMotionLoop();
    this._lipSyncActive = false;
    this._inModelUpdate = false;

    if (this.model) {
      try {
        if (this.model.parent) {
          this.model.parent.removeChild(this.model);
        }
        this.model.destroy();
      } catch (e) {
        warn('模型销毁失败', e);
      }
      this.model = null;
    }
    this._mouthParamCore = null;
    this._mouthParamIds = [];
    this._mouthParamIndexes = [];
    this._mouthParamRangeMins = [];
    this._mouthParamRangeMaxs = [];
    this._mouthParamWarned = false;
    this._mouthCurrentValue = 0;
    if (this._writeMaskRestore) {
      try {
        this._writeMaskRestore();
      } catch {
        // ignore
      }
    }
    this._writeMaskCore = null;
    this._writeMaskRestore = null;
    if (this._updateHookRestore) {
      try {
        this._updateHookRestore();
      } catch {
        // ignore
      }
    }
    this._updateHookModel = null;
    this._updateHookRestore = null;
    this._manualMouthParamEnabled = false;
    this._manualMouthParamIds = [];
    this._manualMouthParamIdSet.clear();
    this.modelBaseWidth = null;
    this.modelBaseHeight = null;
    this.modelBaseBounds = null;
    this._lastModelJson = null;
    this._lastModelJsonSourceUrl = '';
  },

  /**
   * 等待模型纹理加载完成
   */
  async _waitForTextures(
    model: any,
    onProgress?: (loadedCount: number, totalCount: number) => void,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let retryCount = 0;
      const maxRetries = 80;

      const check = () => {
        retryCount++;
        if (retryCount > maxRetries) {
          const internal = model.internalModel;
          const textures = internal?.textures || internal?._textures || [];
          const textureList = Array.isArray(textures) ? textures : [];
          const loadedCount = textureList.filter((tex: any) => !!tex?.baseTexture?.valid).length;
          onProgress?.(loadedCount, textureList.length);
          warn(`纹理加载等待超时 (${loadedCount}/${textureList.length})，模型可能不可见`);
          resolve(false);
          return;
        }

        const internal = model.internalModel;
        if (!internal) {
          setTimeout(check, 100);
          return;
        }

        const textures = internal.textures || internal._textures || [];
        if (textures.length === 0) {
          onProgress?.(1, 1);
          resolve(true);
          return;
        }

        const loadedCount = textures.filter((tex: any) => {
          if (!tex) return false;
          if (tex.baseTexture) return tex.baseTexture.valid;
          return true;
        }).length;
        onProgress?.(loadedCount, textures.length);

        const allLoaded = textures.every((tex: any) => {
          if (!tex) return false;
          if (tex.baseTexture) return tex.baseTexture.valid;
          return true;
        });

        if (allLoaded) {
          resolve(true);
        } else {
          setTimeout(check, 100);
        }
      };

      check();
    });
  },
};



