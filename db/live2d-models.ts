import { LOCAL_LIVE2D_MODEL_SLOT_ID, SCRIPT_NAME, type Live2DRuntimeType, STORE_LIVE2D_MODELS } from '../core/constants';
import { getDb } from '../core/state';
import { initDB } from './init';
import { LIVE2D_RUNTIME_TYPES, normalizeLive2DRuntimeType } from '../live2d/runtime-router';

export type StoredLive2DTexture = {
  name: string;
  data: Blob;
};

export type StoredLive2DMotion = {
  name: string;
  data: ArrayBuffer;
};

export type StoredLive2DExpression = {
  name: string;
  file?: string;
  data: ArrayBuffer;
};

export type StoredLive2DModel = {
  modelId: string;
  source: 'local';
  fileName: string;
  modelJson: any;
  runtimeType: Live2DRuntimeType;
  cubismVersion: number | null;
  moc3Version?: number | null;
  moc3: ArrayBuffer | null;
  moc: ArrayBuffer | null;
  textures: StoredLive2DTexture[];
  motions: Record<string, StoredLive2DMotion[]>;
  expressions: StoredLive2DExpression[];
  physics: ArrayBuffer | null;
  pose: ArrayBuffer | null;
  uploadTime: number;
  fileSize: number;
};

function resolveSlotId(_modelId?: string): string {
  return LOCAL_LIVE2D_MODEL_SLOT_ID;
}

function normalizeStoredModel(modelData: StoredLive2DModel): StoredLive2DModel {
  const runtimeType = normalizeLive2DRuntimeType(modelData?.runtimeType, LIVE2D_RUNTIME_TYPES.LEGACY);
  const cubismVersionRaw = Number(modelData?.cubismVersion);
  const cubismVersion = Number.isFinite(cubismVersionRaw) ? cubismVersionRaw : null;
  const uploadTimeRaw = Number(modelData?.uploadTime);
  const uploadTime = Number.isFinite(uploadTimeRaw) && uploadTimeRaw > 0 ? uploadTimeRaw : Date.now();
  const fileSizeRaw = Number(modelData?.fileSize);
  const fileSize = Number.isFinite(fileSizeRaw) && fileSizeRaw >= 0 ? fileSizeRaw : 0;

  return {
    ...modelData,
    modelId: resolveSlotId(modelData?.modelId),
    source: 'local',
    fileName: String(modelData?.fileName || '').trim() || 'uploaded-live2d.zip',
    runtimeType,
    cubismVersion,
    uploadTime,
    fileSize,
    moc3: modelData?.moc3 ?? null,
    moc: modelData?.moc ?? null,
    physics: modelData?.physics ?? null,
    pose: modelData?.pose ?? null,
    textures: Array.isArray(modelData?.textures) ? modelData.textures : [],
    motions: modelData?.motions && typeof modelData.motions === 'object' ? modelData.motions : {},
    expressions: Array.isArray(modelData?.expressions) ? modelData.expressions : [],
  };
}

async function ensureDb(): Promise<IDBDatabase> {
  if (!getDb()) {
    await initDB();
  }
  const db = getDb();
  if (!db) {
    throw new Error('IndexedDB 未初始化');
  }
  return db;
}

export async function saveLive2DModel(modelData: StoredLive2DModel): Promise<void> {
  const db = await ensureDb();
  const normalized = normalizeStoredModel(modelData);
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction([STORE_LIVE2D_MODELS], 'readwrite');
      const store = transaction.objectStore(STORE_LIVE2D_MODELS);
      store.put(normalized);
      transaction.oncomplete = () => {
        try {
          console.log(`[${SCRIPT_NAME}] 已保存本地 Live2D 模型: ${normalized.fileName}`);
        } catch {
          // ignore
        }
        resolve();
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('保存本地模型失败'));
    } catch (e) {
      reject(e);
    }
  });
}

export async function getLive2DModel(modelId?: string): Promise<StoredLive2DModel | null> {
  const db = await ensureDb();
  const slotId = resolveSlotId(modelId);
  return new Promise((resolve) => {
    try {
      if (!db.objectStoreNames.contains(STORE_LIVE2D_MODELS)) {
        resolve(null);
        return;
      }
      const transaction = db.transaction([STORE_LIVE2D_MODELS], 'readonly');
      const store = transaction.objectStore(STORE_LIVE2D_MODELS);
      const request = store.get(slotId);
      request.onsuccess = () => {
        const result = request.result as StoredLive2DModel | undefined;
        resolve(result ?? null);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function deleteLive2DModel(modelId?: string): Promise<void> {
  const db = await ensureDb();
  const slotId = resolveSlotId(modelId);
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains(STORE_LIVE2D_MODELS)) {
        resolve();
        return;
      }
      const transaction = db.transaction([STORE_LIVE2D_MODELS], 'readwrite');
      const store = transaction.objectStore(STORE_LIVE2D_MODELS);
      store.delete(slotId);
      transaction.oncomplete = () => {
        try {
          console.log(`[${SCRIPT_NAME}] 已删除本地 Live2D 模型槽位: ${slotId}`);
        } catch {
          // ignore
        }
        resolve();
      };
      transaction.onerror = () => reject(transaction.error ?? new Error('删除本地模型失败'));
    } catch (e) {
      reject(e);
    }
  });
}

export async function hasLive2DModel(modelId?: string): Promise<boolean> {
  const model = await getLive2DModel(modelId);
  return !!(model && model.modelJson);
}
