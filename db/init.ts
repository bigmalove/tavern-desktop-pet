import {
  DB_NAME,
  DB_VERSION,
  SCRIPT_NAME,
  STORE_LIVE2D_MODELS,
  STORE_SDK_CACHE,
} from '../core/constants';
import { getDb, setDb } from '../core/state';

function ensureLive2DStore(database: IDBDatabase, transaction: IDBTransaction | null): void {
  if (!database.objectStoreNames.contains(STORE_LIVE2D_MODELS)) {
    const store = database.createObjectStore(STORE_LIVE2D_MODELS, { keyPath: 'modelId' });
    store.createIndex('uploadTime', 'uploadTime', { unique: false });
    store.createIndex('runtimeType', 'runtimeType', { unique: false });
    return;
  }

  if (!transaction) return;
  try {
    const store = transaction.objectStore(STORE_LIVE2D_MODELS);
    if (!store.indexNames.contains('uploadTime')) {
      store.createIndex('uploadTime', 'uploadTime', { unique: false });
    }
    if (!store.indexNames.contains('runtimeType')) {
      store.createIndex('runtimeType', 'runtimeType', { unique: false });
    }
  } catch {
    // ignore
  }
}

function ensureSdkCacheStore(database: IDBDatabase): void {
  if (database.objectStoreNames.contains(STORE_SDK_CACHE)) {
    return;
  }

  database.createObjectStore(STORE_SDK_CACHE, { keyPath: 'id' });
}

export function initDB(): Promise<IDBDatabase> {
  const existing = getDb();
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 打开失败'));
    request.onsuccess = () => {
      const db = request.result;
      setDb(db);
      try {
        db.onversionchange = () => {
          try {
            db.close();
          } catch {
            // ignore
          }
          setDb(null);
        };
      } catch {
        // ignore
      }
      try {
        console.log(`[${SCRIPT_NAME}] IndexedDB 初始化成功`);
      } catch {
        // ignore
      }
      resolve(db);
    };
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = (event.target as IDBOpenDBRequest | null)?.transaction ?? null;
      ensureLive2DStore(database, transaction);
      ensureSdkCacheStore(database);
    };
  });
}
