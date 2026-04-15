type StoreNames = string;

export type IdbDbSpec = {
  name: string;
  version: number;
  onUpgrade: (db: IDBDatabase, oldVersion: number, newVersion: number | null) => void;
};

export async function openIdb(spec: IdbDbSpec): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    throw new Error("indexedDB_unavailable");
  }
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(spec.name, spec.version);
    req.onupgradeneeded = (e) => {
      const ev = e as IDBVersionChangeEvent;
      spec.onUpgrade(req.result, ev.oldVersion ?? 0, ev.newVersion ?? null);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_open_failed"));
  });
}

export async function idbGet<T>(
  db: IDBDatabase,
  storeName: StoreNames,
  key: IDBValidKey
): Promise<T | null> {
  return await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_get_failed"));
  });
}

export async function idbPut(
  db: IDBDatabase,
  storeName: StoreNames,
  value: unknown,
  key?: IDBValidKey
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = key === undefined ? store.put(value as never) : store.put(value as never, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("indexeddb_put_failed"));
  });
}

export async function idbDel(db: IDBDatabase, storeName: StoreNames, key: IDBValidKey): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("indexeddb_delete_failed"));
  });
}

export async function idbGetAllKeys(db: IDBDatabase, storeName: StoreNames): Promise<IDBValidKey[]> {
  return await new Promise<IDBValidKey[]>((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve((req.result as IDBValidKey[] | undefined) ?? []);
    req.onerror = () => reject(req.error ?? new Error("indexeddb_getallkeys_failed"));
  });
}

