import { SDK_URLS } from '../core/constants';
import { log, warn, error } from '../utils/dom';

type Live2DRuntime = {
  pixi: any;
  live2dModel: any;
  pixiVersion: string;
  loadedAt: number;
};

/**
 * Live2D SDK 动态加载器
 * 将 PIXI.js、Cubism Core、pixi-live2d-display 注入到父窗口
 */
export const Live2DLoader = {
  _READY_MARK: '__desktopPetLive2dLoaderReady_v2',
  _RUNTIME_KEY: '__desktopPetLive2dRuntime_v2',
  _JSDELIVR_HOSTS: [
    'cdn.jsdelivr.net',
    'fastly.jsdelivr.net',
    'testingcf.jsdelivr.net',
    'gcore.jsdelivr.net',
  ],
  isLoaded: false,
  loadPromise: null as Promise<boolean> | null,

  async load(): Promise<boolean> {
    const top = window.parent ?? window;
    if (this.isLoaded) {
      const runtime = this._getRuntime(top);
      if (runtime) return true;
      warn('检测到 Live2D runtime 已失效，准备重新加载 SDK（可能被其他插件覆盖 PIXI）');
      this.isLoaded = false;
      this.loadPromise = null;
    }

    const runtime = this._getRuntime(top);
    if (runtime) {
      this.isLoaded = true;
      (top as any)[this._READY_MARK] = true;
      this.loadPromise = null;
      return true;
    }

    if (this.loadPromise) return this.loadPromise;
    this.loadPromise = this._doLoad();
    return this.loadPromise;
  },

  getRuntime(targetWindow?: Window): Live2DRuntime | null {
    const top = targetWindow ?? window.parent ?? window;
    return this._getRuntime(top);
  },

  getPixi(targetWindow?: Window): any | null {
    return this.getRuntime(targetWindow)?.pixi ?? null;
  },

  _getRuntime(top: Window): Live2DRuntime | null {
    const runtime = (top as any)[this._RUNTIME_KEY] as Live2DRuntime | undefined;
    if (!runtime || typeof runtime !== 'object') return null;

    const pixi = runtime.pixi;
    const live2dModel = runtime.live2dModel;
    if (!pixi || !live2dModel) return null;

    const pixiMajor = this._getPixiMajorVersion(pixi);
    if (pixiMajor !== 6) return null;

    // runtime 必须与当前窗口里的 PIXI 实例保持一致，避免与其他插件混用
    if ((top as any).PIXI !== pixi) return null;
    if (pixi?.live2d?.Live2DModel !== live2dModel) return null;

    return runtime;
  },

  _setRuntime(top: Window): Live2DRuntime | null {
    const pixi = (top as any).PIXI;
    const live2dModel = pixi?.live2d?.Live2DModel;
    const pixiMajor = this._getPixiMajorVersion(pixi);
    if (pixiMajor !== 6 || !live2dModel) {
      return null;
    }

    const runtime: Live2DRuntime = {
      pixi,
      live2dModel,
      pixiVersion: String(pixi?.VERSION || 'unknown'),
      loadedAt: Date.now(),
    };
    (top as any)[this._RUNTIME_KEY] = runtime;
    return runtime;
  },

  async _doLoad(): Promise<boolean> {
    const top = window.parent ?? window;

    try {
      const existingRuntime = this._getRuntime(top);
      if (existingRuntime) {
        this.isLoaded = true;
        (top as any)[this._READY_MARK] = true;
        this.loadPromise = null;
        return true;
      }

      // 加载 PIXI.js
      const pixi = (top as any).PIXI;
      const pixiMajor = this._getPixiMajorVersion(pixi);
      if (!pixi || pixiMajor !== 6) {
        if (pixi && pixiMajor !== null && pixiMajor !== 6) {
          warn('检测到已存在的 PIXI 版本不兼容，将尝试覆盖加载 PIXI v6', {
            detected: (pixi as any).VERSION ?? 'unknown',
          });
        }

        log('加载 PIXI.js...');
        await this._loadScriptWithFallback(SDK_URLS.PIXI, top, 'PIXI.js');
        log('PIXI.js 加载完成');
      }

      if (!(top as any).window.PIXI) {
        (top as any).window.PIXI = (top as any).PIXI;
      }

      // 加载 Cubism 4 Core
      if (!this._hasValidCubism4Core(top)) {
        if ((top as any).Live2DCubismCore) {
          warn('检测到 Cubism 4 Core 全局对象异常，尝试重新加载');
        }
        log('加载 Cubism 4 Core...');
        try {
          await this._loadScriptWithFallback(SDK_URLS.CUBISM4_CORE, top, 'Cubism 4 Core', 20000);
          log('Cubism 4 Core 加载完成');
        } catch (e) {
          warn('Cubism 4 Core 加载失败，部分模型可能不可用', e);
        }
      }

      // 加载 Cubism 2 Core
      if (!(top as any).Live2D) {
        log('加载 Cubism 2 Core...');
        try {
          await this._loadScriptWithFallback(SDK_URLS.CUBISM2_CORE, top, 'Cubism 2 Core', 20000);
          log('Cubism 2 Core 加载完成');
        } catch (e) {
          warn('Cubism 2 Core 加载失败，旧模型可能不可用', e);
        }
      }

      // 加载 pixi-live2d-display
      log('加载 pixi-live2d-display...');
      await this._loadScriptWithFallback(SDK_URLS.PIXI_LIVE2D_DISPLAY, top, 'pixi-live2d-display', 25000);
      await new Promise(r => setTimeout(r, 120));

      const runtime = this._setRuntime(top);
      if (!runtime) {
        throw new Error('pixi-live2d-display 加载完成但未建立桌面宠物专属运行时');
      }

      this.isLoaded = true;
      (top as any)[this._READY_MARK] = true;
      this.loadPromise = null;
      log('Live2D SDK 全部加载完成', {
        pixi: runtime.pixiVersion,
      });
      return true;
    } catch (e) {
      error('Live2D SDK 加载失败:', e);
      (top as any)[this._READY_MARK] = false;
      (top as any)[this._RUNTIME_KEY] = null;
      this.isLoaded = false;
      this.loadPromise = null;
      return false;
    }
  },

  _getPixiMajorVersion(pixi: any): number | null {
    if (!pixi || typeof pixi !== 'object') return null;
    const version = String((pixi as any).VERSION || '').trim();
    if (!version) return null;
    const majorStr = version.split('.')[0];
    const major = Number.parseInt(majorStr, 10);
    return Number.isFinite(major) ? major : null;
  },

  _buildUrlCandidates(originalUrl: string): string[] {
    const url = String(originalUrl || '').trim();
    if (!url) return [];

    const candidates: string[] = [];
    const add = (candidate: string) => {
      const value = String(candidate || '').trim();
      if (!value) return;
      if (!candidates.includes(value)) candidates.push(value);
    };

    add(url);

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return candidates;
    }

    const host = urlObj.hostname.toLowerCase();
    if (host.endsWith('jsdelivr.net')) {
      for (const h of this._JSDELIVR_HOSTS) {
        try {
          const u = new URL(url);
          u.hostname = h;
          add(u.toString());
        } catch {
          // ignore
        }
      }

      if (urlObj.pathname.startsWith('/npm/')) {
        try {
          const u = new URL(url);
          u.hostname = 'unpkg.com';
          u.pathname = urlObj.pathname.replace(/^\/npm\//, '/');
          add(u.toString());
        } catch {
          // ignore
        }
      }

      if (urlObj.pathname.startsWith('/gh/')) {
        const rest = urlObj.pathname.slice('/gh/'.length);
        const parts = rest.split('/').filter(Boolean);
        if (parts.length >= 3) {
          const owner = parts[0];
          const repoWithRef = parts[1];
          const filePath = parts.slice(2).join('/');
          if (owner && repoWithRef && filePath) {
            const [repo, ref] = repoWithRef.split('@');
            const suffix = `${urlObj.search || ''}${urlObj.hash || ''}`;
            if (ref) {
              add(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}${suffix}`);
            } else {
              add(`https://raw.githubusercontent.com/${owner}/${repo}/master/${filePath}${suffix}`);
              add(`https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}${suffix}`);
            }
          }
        }
      }
    }

    return candidates;
  },

  _hasValidCubism4Core(targetWindow: Window): boolean {
    const core = (targetWindow as any).Live2DCubismCore;
    if (!core || typeof core !== 'object') return false;

    const hasVersion = typeof core.Version === 'function';
    const hasMoc = typeof core.Moc === 'function' || typeof core.Moc === 'object';
    const hasUtils = typeof core.Utils === 'object';

    return hasVersion || hasMoc || hasUtils;
  },

  _loadScriptBySrc(url: string, targetWindow: Window, timeoutMs = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      let timer: number | null = null;
      try {
        const doc = targetWindow.document;
        const script = doc.createElement('script');
        script.src = url;
        script.async = true;
        script.dataset.desktopPetSdk = 'true';

        const cleanup = () => {
          script.onload = null;
          script.onerror = null;
          if (timer !== null) {
            targetWindow.clearTimeout(timer);
            timer = null;
          }
        };

        script.onload = () => {
          cleanup();
          resolve();
        };
        script.onerror = () => {
          cleanup();
          reject(new Error(`脚本加载失败: ${url}`));
        };

        timer = targetWindow.setTimeout(() => {
          cleanup();
          reject(new Error(`脚本加载超时 (${timeoutMs}ms): ${url}`));
        }, timeoutMs);

        doc.head.appendChild(script);
      } catch (e) {
        if (timer !== null) {
          targetWindow.clearTimeout(timer);
        }
        reject(e);
      }
    });
  },

  async _loadScriptWithFallback(
    url: string,
    targetWindow: Window,
    label: string,
    timeoutMs = 15000,
  ): Promise<string> {
    const candidates = this._buildUrlCandidates(url);
    let lastError: unknown = null;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        if (i > 0) {
          warn(`${label} 主地址加载失败，尝试备用地址:`, candidate);
        }
        await this._loadScriptBySrc(candidate, targetWindow, timeoutMs);
        return candidate;
      } catch (e) {
        lastError = e;
      }
    }

    throw (lastError instanceof Error ? lastError : new Error(`${label} 加载失败`));
  },
};
