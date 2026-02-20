let _db: IDBDatabase | null = null;

export function getDb(): IDBDatabase | null {
  return _db;
}

export function setDb(value: IDBDatabase | null): void {
  _db = value;
}
