import { SCRIPT_NAME } from '../core/constants';
import { Live2DManager } from './manager';

// 延迟引用: TTSManager._getProxiedAudioUrl (来自 audio/tts-manager.ts，避免循环)
let _ttsGetProxiedAudioUrlRef: ((url: string) => string) | null = null;
export function setLipSyncRefs({ getProxiedAudioUrl }: { getProxiedAudioUrl?: (url: string) => string }): void {
  if (getProxiedAudioUrl) _ttsGetProxiedAudioUrlRef = getProxiedAudioUrl;
}

function getTopWindow(): Window {
  try {
    return window.parent ?? window;
  } catch {
    return window;
  }
}

// ============================================
// LipSync 口型同步管理器 (增强修复版)
// 完全参考: galgame通用生成器/src/live2d/lip-sync.js
// ============================================
export const LipSyncManager = {
  audioContext: null as AudioContext | null,
  analyser: null as AnalyserNode | null,
  dataArray: null as Uint8Array | null,
  source: null as MediaElementAudioSourceNode | null,
  animationFrameId: null as number | null,
  currentCharacterId: null as string | null,
  lastVolume: 0,
  connectedAudioElements: new WeakSet<HTMLAudioElement>(),
  _proxyAudio: null as HTMLAudioElement | null,
  _proxyAudioCleanup: null as (() => void) | null,

  config: {
    fftSize: 256,
    smoothingFactor: 0.5,
    sensitivity: 2.5,
    minThreshold: 0.01,
  },

  init(): void {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          console.log(`[${SCRIPT_NAME}] LipSync: AudioContext 已恢复`);
        });
      }
      return;
    }

    const topAny: any = getTopWindow() as any;
    const AudioContextClass = topAny.AudioContext || topAny.webkitAudioContext;
    if (!AudioContextClass) {
      console.warn(`[${SCRIPT_NAME}] LipSync: 浏览器不支持 Web Audio API`);
      return;
    }

    this.audioContext = new AudioContextClass();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = this.config.fftSize;
    this.analyser.smoothingTimeConstant = this.config.smoothingFactor;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    console.log(`[${SCRIPT_NAME}] LipSyncManager 初始化完成`);
  },

  _getProxiedAudioUrl(originalUrl: string): string {
    if (_ttsGetProxiedAudioUrlRef) {
      return _ttsGetProxiedAudioUrlRef(originalUrl);
    }

    const topAny: any = getTopWindow() as any;

    if (typeof topAny.getCorsProxyUrl === 'function') {
      try {
        const proxied = topAny.getCorsProxyUrl(originalUrl);
        console.log(`[${SCRIPT_NAME}] LipSync: 使用 getCorsProxyUrl 代理音频`);
        return proxied;
      } catch (e) {
        console.warn(`[${SCRIPT_NAME}] LipSync: getCorsProxyUrl 失败`, e);
      }
    }

    if (typeof topAny.enableCorsProxy === 'function') {
      try {
        const proxied = topAny.enableCorsProxy(originalUrl);
        if (typeof proxied === 'string' && proxied) {
          console.log(`[${SCRIPT_NAME}] LipSync: 使用 enableCorsProxy 代理音频`);
          return proxied;
        }
      } catch (e) {
        console.warn(`[${SCRIPT_NAME}] LipSync: enableCorsProxy 失败`, e);
      }
    }

    if (topAny.corsProxy?.getProxyUrl) {
      try {
        const proxied = topAny.corsProxy.getProxyUrl(originalUrl);
        console.log(`[${SCRIPT_NAME}] LipSync: 使用 corsProxy.getProxyUrl 代理音频`);
        return proxied;
      } catch (e) {
        console.warn(`[${SCRIPT_NAME}] LipSync: corsProxy.getProxyUrl 失败`, e);
      }
    }

    if (topAny.location) {
      const origin = topAny.location.origin;
      console.log(`[${SCRIPT_NAME}] LipSync: 使用默认代理端点 /proxy`);
      return `${origin}/proxy?url=${encodeURIComponent(originalUrl)}`;
    }

    return originalUrl;
  },

  connectAudio(audioElement: HTMLAudioElement): boolean {
    if (!audioElement) return false;

    if (this.connectedAudioElements.has(audioElement)) {
      this.init();
      if (this.audioContext?.state === 'suspended') {
        this.audioContext.resume();
      }
      return true;
    }

    this.init();
    if (!this.audioContext || !this.analyser) return false;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(e => console.warn('AudioContext resume failed:', e));
    }

    try {
      if (this.source) {
        try {
          this.source.disconnect();
        } catch {
          // ignore
        }
      }

      const topAny: any = getTopWindow() as any;
      let targetAudio: HTMLAudioElement = audioElement;
      const src = audioElement.src || '';
      const isLocalhost = src.includes('127.0.0.1') || src.includes('localhost');
      const isDataUrl = src.startsWith('data:');
      const isBlobUrl = src.startsWith('blob:');
      let isSameOrigin = false;
      try {
        const base = topAny.location?.origin || window.location.origin;
        const url = new URL(src, base);
        isSameOrigin = url.origin === base;
      } catch {
        // ignore
      }

      if (!isLocalhost && !isDataUrl && !isBlobUrl && !isSameOrigin) {
        console.log(`[${SCRIPT_NAME}] LipSync: 检测到跨域音频，尝试使用代理`);
        const proxiedUrl = this._getProxiedAudioUrl(src);
        if (proxiedUrl && proxiedUrl !== src) {
          targetAudio = new Audio(proxiedUrl);
          targetAudio.crossOrigin = 'anonymous';
          console.log(`[${SCRIPT_NAME}] LipSync: 创建代理音频元素`, proxiedUrl.substring(0, 50) + '...');

          targetAudio.currentTime = audioElement.currentTime;
          targetAudio.volume = 0.001;

          if (!audioElement.paused) {
            targetAudio.play().catch(e => {
              console.warn(`[${SCRIPT_NAME}] LipSync: 代理音频播放失败`, e);
            });
          }

          const syncPlay = () => {
            if (this._proxyAudio && this._proxyAudio.paused) {
              this._proxyAudio.currentTime = audioElement.currentTime;
              this._proxyAudio.play().catch(() => {});
            }
          };
          const syncPause = () => {
            if (this._proxyAudio) {
              this._proxyAudio.pause();
            }
          };
          const syncSeek = () => {
            if (this._proxyAudio) {
              this._proxyAudio.currentTime = audioElement.currentTime;
            }
          };

          audioElement.addEventListener('play', syncPlay);
          audioElement.addEventListener('playing', syncPlay);
          audioElement.addEventListener('pause', syncPause);
          audioElement.addEventListener('ended', syncPause);
          audioElement.addEventListener('seeked', syncSeek);

          this._proxyAudio = targetAudio;
          this._proxyAudioCleanup = () => {
            audioElement.removeEventListener('play', syncPlay);
            audioElement.removeEventListener('playing', syncPlay);
            audioElement.removeEventListener('pause', syncPause);
            audioElement.removeEventListener('ended', syncPause);
            audioElement.removeEventListener('seeked', syncSeek);
          };
        }
      }

      console.log(`[${SCRIPT_NAME}] LipSync: 连接音频源`, targetAudio.src?.substring(0, 50) + '...');
      this.source = this.audioContext.createMediaElementSource(targetAudio);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      this.connectedAudioElements.add(audioElement);
      return true;
    } catch (e) {
      console.warn(`[${SCRIPT_NAME}] LipSync: 连接失败 (可能是跨域或已被其他 Source 连接)`, e);
      return false;
    }
  },

  getVolume(): number {
    if (!this.analyser || !this.dataArray) return 0;
    this.analyser.getByteFrequencyData(this.dataArray);

    let sum = 0;
    const length = Math.floor(this.dataArray.length * 0.75);
    for (let i = 0; i < length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / length / 255;
    return Math.min(1, average * this.config.sensitivity);
  },

  async startSync(characterId: string): Promise<void> {
    this.stopSync();
    this.currentCharacterId = characterId;
    Live2DManager._setLipSyncActive(true);

    if (this.audioContext?.state === 'suspended') {
      try {
        await this.audioContext.resume();
        console.log(`[${SCRIPT_NAME}] LipSync: AudioContext 已恢复`);
      } catch (e) {
        console.warn(`[${SCRIPT_NAME}] LipSync: AudioContext 恢复失败`, e);
      }
    }

    console.log(
      `[${SCRIPT_NAME}] LipSync: 开始口型同步 - characterId=${characterId}, AudioContext.state=${this.audioContext?.state}`,
    );

    let frameCount = 0;
    const update = () => {
      if (!this.currentCharacterId) return;

      let volume = this.getVolume();
      if (volume < this.config.minThreshold) volume = 0;

      volume = this.lastVolume * 0.4 + volume * 0.6;
      this.lastVolume = volume;

      frameCount++;
      if (frameCount % 30 === 0) {
        console.log(`[${SCRIPT_NAME}] LipSync: 音量=${volume.toFixed(3)}, rawData[0]=${this.dataArray?.[0]}`);
      }

      Live2DManager.setMouthOpen(this.currentCharacterId, volume);
      this.animationFrameId = requestAnimationFrame(update);
    };
    update();
  },

  stopSync(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.currentCharacterId) {
      Live2DManager.setMouthOpen(this.currentCharacterId, 0);
    }
    this.currentCharacterId = null;
    this.lastVolume = 0;
    Live2DManager._setLipSyncActive(false);

    if (this._proxyAudioCleanup) {
      try {
        this._proxyAudioCleanup();
      } catch {
        // ignore
      }
      this._proxyAudioCleanup = null;
    }

    if (this._proxyAudio) {
      try {
        this._proxyAudio.pause();
        this._proxyAudio.src = '';
      } catch {
        // ignore
      }
      this._proxyAudio = null;
    }
  },

  cleanup(): void {
    this.stopSync();
    if (this.source) {
      try {
        this.source.disconnect();
      } catch {
        // ignore
      }
      this.source = null;
    }
  },
};
