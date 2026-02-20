import { LOCAL_LIVE2D_MODEL_SLOT_ID, SCRIPT_NAME } from '../core/constants';
import { saveLive2DModel, type StoredLive2DModel } from '../db/live2d-models';
import { Live2DLoader } from './loader';
import {
  LIVE2D_RUNTIME_TYPES,
  inferCubismVersionFromModelJson,
  resolveRuntimeTypeFromCubismVersion,
} from './runtime-router';

type JSZipLike = {
  file(path: string): any;
  forEach(callback: (path: string, file: any) => void): void;
};

type ModelJsonEntry = {
  path: string;
  file: any;
  priority: number;
};

export const Live2DUploader = {
  JSZip: null as any,

  async _loadJSZip(): Promise<any> {
    if (this.JSZip) return this.JSZip;

    const topWindow = window.parent ?? window;
    if ((topWindow as any).JSZip) {
      this.JSZip = (topWindow as any).JSZip;
      return this.JSZip;
    }

    return new Promise((resolve, reject) => {
      const script = topWindow.document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.async = true;
      script.onload = () => {
        this.JSZip = (topWindow as any).JSZip;
        if (!this.JSZip) {
          reject(new Error('JSZip 加载后未找到全局对象'));
          return;
        }
        try {
          console.log(`[${SCRIPT_NAME}] JSZip 加载完成`);
        } catch {
          // ignore
        }
        resolve(this.JSZip);
      };
      script.onerror = () => reject(new Error('JSZip 加载失败'));
      topWindow.document.head.appendChild(script);
    });
  },

  async uploadZip(file: File): Promise<StoredLive2DModel> {
    const JSZip = await this._loadJSZip();
    const zip = (await JSZip.loadAsync(file)) as JSZipLike;

    try {
      console.log(
        `[${SCRIPT_NAME}] Live2DUploader: 开始解析 ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`,
      );
    } catch {
      // ignore
    }

    const modelJsonEntry = await this._findModelJson(zip);
    if (!modelJsonEntry) {
      throw new Error('未找到 Live2D 模型配置（model3.json / model.json / *.model.json / model*.json）');
    }

    const modelDir = modelJsonEntry.path.substring(0, modelJsonEntry.path.lastIndexOf('/') + 1);
    const modelJsonText = String(await modelJsonEntry.file.async('text')).replace(/^\uFEFF/, '');
    const modelJson = JSON.parse(modelJsonText);

    const entryPathLower = String(modelJsonEntry.path || '').toLowerCase();
    const isModel3 = entryPathLower.endsWith('model3.json') || !!modelJson?.FileReferences;
    const isModel2 =
      !isModel3 &&
      (typeof modelJson?.model === 'string' ||
        typeof modelJson?.Model === 'string' ||
        Array.isArray(modelJson?.textures) ||
        Array.isArray(modelJson?.expressions) ||
        typeof modelJson?.motions === 'object');

    try {
      console.log(
        `[${SCRIPT_NAME}] Live2DUploader: 模型配置解析完成，目录: ${modelDir || '根目录'}，类型: ${
          isModel3 ? 'Cubism 3/4/5' : 'Cubism 2.1'
        }`,
      );
    } catch {
      // ignore
    }

    let modelData: StoredLive2DModel;
    if (isModel3) {
      const moc3Data = await this._extractFile(zip, modelDir, modelJson.FileReferences?.Moc);
      const moc3HeaderVersion = this._readMoc3HeaderVersion(moc3Data);
      const detectedCubismVersion = await this._resolveModel3CubismVersion(modelJson, moc3Data);
      const runtimeType = resolveRuntimeTypeFromCubismVersion(detectedCubismVersion);
      modelData = {
        modelId: LOCAL_LIVE2D_MODEL_SLOT_ID,
        source: 'local',
        fileName: String(file.name || '').trim() || 'uploaded-live2d.zip',
        runtimeType,
        cubismVersion: detectedCubismVersion,
        moc3Version: moc3HeaderVersion ?? null,
        modelJson,
        moc3: moc3Data,
        moc: null,
        textures: await this._extractTextures(zip, modelDir, modelJson),
        motions: await this._extractMotions(zip, modelDir, modelJson),
        expressions: await this._extractExpressions(zip, modelDir, modelJson),
        physics: modelJson.FileReferences?.Physics
          ? await this._extractFileOptional(zip, modelDir, modelJson.FileReferences.Physics)
          : null,
        pose: modelJson.FileReferences?.Pose
          ? await this._extractFileOptional(zip, modelDir, modelJson.FileReferences.Pose)
          : null,
        uploadTime: Date.now(),
        fileSize: file.size,
      };
    } else if (isModel2) {
      const mocPath = modelJson?.model || modelJson?.Model;
      const physicsPath = modelJson?.physics || modelJson?.Physics;
      const posePath = modelJson?.pose || modelJson?.Pose;
      modelData = {
        modelId: LOCAL_LIVE2D_MODEL_SLOT_ID,
        source: 'local',
        fileName: String(file.name || '').trim() || 'uploaded-live2d.zip',
        runtimeType: LIVE2D_RUNTIME_TYPES.LEGACY,
        cubismVersion: 2,
        modelJson,
        moc3Version: null,
        moc3: null,
        moc: await this._extractFile(zip, modelDir, mocPath),
        textures: await this._extractTexturesV2(zip, modelDir, modelJson),
        motions: await this._extractMotionsV2(zip, modelDir, modelJson),
        expressions: await this._extractExpressionsV2(zip, modelDir, modelJson),
        physics: physicsPath ? await this._extractFileOptional(zip, modelDir, physicsPath) : null,
        pose: posePath ? await this._extractFileOptional(zip, modelDir, posePath) : null,
        uploadTime: Date.now(),
        fileSize: file.size,
      };
    } else {
      throw new Error('未识别的 Live2D 模型格式：请确保 zip 中包含标准的 model3.json / model.json');
    }

    await saveLive2DModel(modelData);

    try {
      console.log(`[${SCRIPT_NAME}] Live2DUploader: 本地模型保存成功`, {
        modelId: modelData.modelId,
        runtimeType: modelData.runtimeType,
        cubismVersion: modelData.cubismVersion,
      });
    } catch {
      // ignore
    }

    return modelData;
  },

  _toArrayBuffer(input: unknown): ArrayBuffer | null {
    if (!input) return null;
    if (input instanceof ArrayBuffer) return input;
    if (ArrayBuffer.isView(input)) {
      return input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    }
    return null;
  },

  _normalizeMocVersion(rawMocVersion: unknown): number | null {
    const value = Number(rawMocVersion || 0);
    if (!Number.isFinite(value)) return null;
    if (value >= 5) return 5;
    if (value >= 1 && value <= 4) return 4;
    return null;
  },

  _readMoc3HeaderVersion(moc3Data: unknown): number | null {
    const moc3Buffer = this._toArrayBuffer(moc3Data);
    if (!moc3Buffer || moc3Buffer.byteLength < 8) return null;

    try {
      const header = new Uint8Array(moc3Buffer, 0, 4);
      const signature = String.fromCharCode(...header);
      if (signature !== 'MOC3') return null;
      const view = new DataView(moc3Buffer);
      return Number(view.getUint32(4, true) || 0) || null;
    } catch {
      return null;
    }
  },

  _detectCubismVersionFromMoc3Buffer(moc3Data: unknown): number | null {
    const moc3Buffer = this._toArrayBuffer(moc3Data);
    if (!moc3Buffer) return null;

    const topWindow = window.parent ?? window;
    const core = (topWindow as any)?.Live2DCubismCore;
    const Moc = core?.Moc;
    const Version = core?.Version;
    if (typeof Moc?.fromArrayBuffer !== 'function' || typeof Version?.csmGetMocVersion !== 'function') {
      return null;
    }

    let mocRef: any = null;
    try {
      mocRef = Moc.fromArrayBuffer(moc3Buffer);
      if (!mocRef) return null;

      const rawMocVersion = Number(Version.csmGetMocVersion(mocRef, moc3Buffer) || 0) || 0;
      const latestMocVersion = Number(Version?.csmGetLatestMocVersion?.() || 0) || 0;
      const normalized = this._normalizeMocVersion(rawMocVersion);
      if (latestMocVersion > 0 && rawMocVersion > latestMocVersion) {
        return null;
      }
      return normalized;
    } catch {
      return null;
    } finally {
      try {
        if (mocRef && typeof mocRef._release === 'function') {
          mocRef._release();
        } else if (mocRef && typeof mocRef.release === 'function') {
          mocRef.release();
        }
      } catch {
        // ignore
      }
    }
  },

  async _resolveModel3CubismVersion(modelJson: any, moc3Data: ArrayBuffer): Promise<number> {
    const jsonFallbackVersion = inferCubismVersionFromModelJson(modelJson, 4) || 4;
    const headerVersionRaw = this._readMoc3HeaderVersion(moc3Data);
    const headerVersion = this._normalizeMocVersion(headerVersionRaw);
    if (headerVersion != null) {
      return headerVersion;
    }

    try {
      const requiredLatestVersion = headerVersionRaw && headerVersionRaw >= 5 ? headerVersionRaw : 5;
      await Live2DLoader.ensureCubism5Core(requiredLatestVersion);
    } catch {
      // ignore
    }

    const mocVersion = this._detectCubismVersionFromMoc3Buffer(moc3Data);
    return mocVersion ?? headerVersion ?? jsonFallbackVersion;
  },

  async _findModelJson(zip: JSZipLike): Promise<ModelJsonEntry | null> {
    const candidates: ModelJsonEntry[] = [];
    const jsonEntries: Array<{ path: string; file: any }> = [];

    zip.forEach((path, file) => {
      if (file?.dir) return;
      if (/(^|\/)model3\.json$/i.test(path) || /\.model3\.json$/i.test(path)) {
        candidates.push({ path, file, priority: 1 });
      } else if (/(^|\/)model\.json$/i.test(path) || /\.model\.json$/i.test(path)) {
        candidates.push({ path, file, priority: 2 });
      } else if (/(^|\/)model[_-]?\d+\.json$/i.test(path)) {
        candidates.push({ path, file, priority: 3 });
      }

      if (/\.json$/i.test(path)) {
        jsonEntries.push({ path, file });
      }
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.priority - b.priority);
      return candidates[0];
    }

    let best: { path: string; file: any } | null = null;
    let bestScore = 0;
    for (const entry of jsonEntries) {
      try {
        const text = await entry.file.async('text');
        const json = JSON.parse(text);
        if (!json || typeof json !== 'object') continue;

        let score = 0;
        const fileName = String(entry.path).split('/').pop()?.toLowerCase() ?? '';
        if (fileName.includes('model')) score += 50;
        if (json.FileReferences && typeof json.FileReferences === 'object') {
          score += 100;
          if (typeof json.FileReferences.Moc === 'string') score += 1000;
          if (Array.isArray(json.FileReferences.Textures)) score += 200;
        }
        if (typeof json.model === 'string' || typeof json.Model === 'string') score += 900;
        if (Array.isArray(json.textures) || Array.isArray(json.Textures)) score += 200;

        if (score > bestScore) {
          best = entry;
          bestScore = score;
        }
      } catch {
        // ignore
      }
    }

    if (!best) return null;
    return { path: best.path, file: best.file, priority: 99 };
  },

  async _extractFile(zip: JSZipLike, baseDir: string, relativePath: string): Promise<ArrayBuffer> {
    const target = String(relativePath || '').trim();
    if (!target) {
      throw new Error('文件路径为空');
    }

    const fullPath = `${baseDir}${target}`;
    let file = zip.file(fullPath);
    if (!file) {
      file = zip.file(target);
    }
    if (!file) {
      const normalizedPath = target.replace(/\\/g, '/');
      file = zip.file(`${baseDir}${normalizedPath}`) || zip.file(normalizedPath);
    }
    if (!file) {
      throw new Error(`文件不存在: ${fullPath}`);
    }

    return await file.async('arraybuffer');
  },

  async _extractFileOptional(zip: JSZipLike, baseDir: string, relativePath: string): Promise<ArrayBuffer | null> {
    try {
      return await this._extractFile(zip, baseDir, relativePath);
    } catch {
      return null;
    }
  },

  async _extractTextures(zip: JSZipLike, baseDir: string, modelJson: any): Promise<StoredLive2DModel['textures']> {
    const textures: StoredLive2DModel['textures'] = [];
    const textureList = Array.isArray(modelJson?.FileReferences?.Textures) ? modelJson.FileReferences.Textures : [];

    for (const texPathRaw of textureList) {
      const texPath = String(texPathRaw || '').trim();
      if (!texPath) continue;
      try {
        const data = await this._extractFile(zip, baseDir, texPath);
        const lower = texPath.toLowerCase();
        const mimeType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        textures.push({
          name: texPath,
          data: new Blob([data], { type: mimeType }),
        });
      } catch (e) {
        console.warn(`[${SCRIPT_NAME}] Live2DUploader: 纹理提取失败: ${texPath}`, e);
      }
    }

    return textures;
  },

  async _extractTexturesV2(zip: JSZipLike, baseDir: string, modelJson: any): Promise<StoredLive2DModel['textures']> {
    const textures: StoredLive2DModel['textures'] = [];
    const textureList = modelJson?.textures || modelJson?.Textures || [];
    if (!Array.isArray(textureList)) return textures;

    for (const texPathRaw of textureList) {
      const texPath = String(texPathRaw || '').trim();
      if (!texPath) continue;
      try {
        const data = await this._extractFile(zip, baseDir, texPath);
        const lower = texPath.toLowerCase();
        const mimeType = lower.endsWith('.png') ? 'image/png' : lower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
        textures.push({
          name: texPath,
          data: new Blob([data], { type: mimeType }),
        });
      } catch (e) {
        console.warn(`[${SCRIPT_NAME}] Live2DUploader: 纹理提取失败: ${texPath}`, e);
      }
    }

    return textures;
  },

  async _extractMotions(zip: JSZipLike, baseDir: string, modelJson: any): Promise<StoredLive2DModel['motions']> {
    const motions: StoredLive2DModel['motions'] = {};
    const motionGroups = modelJson?.FileReferences?.Motions || {};

    for (const [groupName, motionList] of Object.entries(motionGroups)) {
      motions[groupName] = [];
      if (!Array.isArray(motionList)) continue;
      for (const motionDef of motionList) {
        const filePath = typeof motionDef === 'string' ? motionDef : (motionDef as any)?.File;
        if (!filePath) continue;
        try {
          const data = await this._extractFile(zip, baseDir, filePath);
          motions[groupName].push({ name: filePath, data });
        } catch (e) {
          console.warn(`[${SCRIPT_NAME}] Live2DUploader: 动作提取失败: ${filePath}`, e);
        }
      }
    }

    const extractedCount = Object.values(motions).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0,
    );

    if (extractedCount === 0) {
      const collectScannedMotions = (scanAllZip = false): string[] => {
        const scanned: string[] = [];
        zip.forEach((path, file) => {
          if (file?.dir) return;
          if (!scanAllZip && !path.startsWith(baseDir)) return;
          if (!/\.motion3\.json$/i.test(path)) return;
          scanned.push(path.startsWith(baseDir) ? path.substring(baseDir.length) : path);
        });
        return scanned;
      };

      let scannedMotions = collectScannedMotions(false);
      if (scannedMotions.length === 0) {
        scannedMotions = collectScannedMotions(true);
      }

      if (scannedMotions.length > 0) {
        scannedMotions.sort((a, b) => a.localeCompare(b, 'zh-CN'));
        motions.default = [];
        for (const filePath of scannedMotions) {
          try {
            const data = await this._extractFile(zip, baseDir, filePath);
            motions.default.push({ name: filePath, data });
          } catch (e) {
            console.warn(`[${SCRIPT_NAME}] Live2DUploader: 扫描动作提取失败: ${filePath}`, e);
          }
        }
      }
    }

    return motions;
  },

  async _extractMotionsV2(zip: JSZipLike, baseDir: string, modelJson: any): Promise<StoredLive2DModel['motions']> {
    const motions: StoredLive2DModel['motions'] = {};
    const motionGroups = modelJson?.motions || modelJson?.Motions || {};

    for (const [groupName, motionList] of Object.entries(motionGroups || {})) {
      motions[groupName] = [];
      if (!Array.isArray(motionList)) continue;
      for (const motionDef of motionList) {
        const filePath =
          typeof motionDef === 'string' ? motionDef : (motionDef as any)?.file || (motionDef as any)?.File;
        if (!filePath) continue;
        try {
          const data = await this._extractFile(zip, baseDir, filePath);
          motions[groupName].push({ name: filePath, data });
        } catch (e) {
          console.warn(`[${SCRIPT_NAME}] Live2DUploader: 动作提取失败: ${filePath}`, e);
        }
      }
    }

    const extractedCount = Object.values(motions).reduce(
      (sum, list) => sum + (Array.isArray(list) ? list.length : 0),
      0,
    );
    if (extractedCount === 0) {
      const scannedMotions: string[] = [];
      zip.forEach((path, file) => {
        if (file?.dir) return;
        if (path.startsWith(baseDir) && /\.mtn$/i.test(path)) {
          scannedMotions.push(path.substring(baseDir.length));
        }
      });

      if (scannedMotions.length > 0) {
        motions.default = [];
        for (const filePath of scannedMotions) {
          try {
            const data = await this._extractFile(zip, baseDir, filePath);
            motions.default.push({ name: filePath, data });
          } catch (e) {
            console.warn(`[${SCRIPT_NAME}] Live2DUploader: 扫描动作提取失败: ${filePath}`, e);
          }
        }
      }
    }

    return motions;
  },

  async _extractExpressions(
    zip: JSZipLike,
    baseDir: string,
    modelJson: any,
  ): Promise<StoredLive2DModel['expressions']> {
    const expressions: StoredLive2DModel['expressions'] = [];
    const exprList = modelJson?.FileReferences?.Expressions || [];

    for (const exprDef of exprList) {
      const filePath = typeof exprDef === 'string' ? exprDef : exprDef?.File;
      const name = typeof exprDef === 'object' ? exprDef?.Name : filePath;
      if (!filePath) continue;
      try {
        const data = await this._extractFile(zip, baseDir, filePath);
        expressions.push({ name: String(name || filePath), file: String(filePath), data });
      } catch (e) {
        console.warn(`[${SCRIPT_NAME}] Live2DUploader: 表情提取失败: ${filePath}`, e);
      }
    }

    if (expressions.length === 0) {
      const scannedExprs: string[] = [];
      zip.forEach((path, file) => {
        if (file?.dir) return;
        if (path.startsWith(baseDir) && /\.exp3\.json$/i.test(path)) {
          scannedExprs.push(path.substring(baseDir.length));
        }
      });

      for (const filePath of scannedExprs) {
        try {
          const data = await this._extractFile(zip, baseDir, filePath);
          const name = filePath.replace(/\.exp3\.json$/i, '').split('/').pop() || filePath;
          expressions.push({ name, file: filePath, data });
        } catch (e) {
          console.warn(`[${SCRIPT_NAME}] Live2DUploader: 扫描表情提取失败: ${filePath}`, e);
        }
      }
    }

    return expressions;
  },

  async _extractExpressionsV2(
    zip: JSZipLike,
    baseDir: string,
    modelJson: any,
  ): Promise<StoredLive2DModel['expressions']> {
    const expressions: StoredLive2DModel['expressions'] = [];
    const exprList = modelJson?.expressions || modelJson?.Expressions || [];

    if (Array.isArray(exprList)) {
      for (const exprDef of exprList) {
        const filePath = typeof exprDef === 'string' ? exprDef : exprDef?.file || exprDef?.File;
        const name = typeof exprDef === 'string' ? exprDef : exprDef?.name || exprDef?.Name || filePath;
        if (!filePath) continue;
        try {
          const data = await this._extractFile(zip, baseDir, filePath);
          expressions.push({ name: String(name || filePath), file: String(filePath), data });
        } catch (e) {
          console.warn(`[${SCRIPT_NAME}] Live2DUploader: 表情提取失败: ${filePath}`, e);
        }
      }
    }

    if (expressions.length === 0) {
      const scannedExprs: string[] = [];
      zip.forEach((path, file) => {
        if (file?.dir) return;
        if (path.startsWith(baseDir) && /\.exp\.json$/i.test(path)) {
          scannedExprs.push(path.substring(baseDir.length));
        }
      });

      for (const filePath of scannedExprs) {
        try {
          const data = await this._extractFile(zip, baseDir, filePath);
          const name = filePath.replace(/\.exp\.json$/i, '').split('/').pop() || filePath;
          expressions.push({ name, file: filePath, data });
        } catch (e) {
          console.warn(`[${SCRIPT_NAME}] Live2DUploader: 扫描表情提取失败: ${filePath}`, e);
        }
      }
    }

    return expressions;
  },
};
