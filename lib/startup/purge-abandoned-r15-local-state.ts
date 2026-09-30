/**
 * One-shot demolition helper: remove abandoned R15 local generation state.
 * Does NOT create Intro/System Start presentation authority.
 */

const R15_INDEXED_DB_NAME = "dibay-r15-startup-presentation";

function deleteIndexedDb(name: string): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function purgeR15CacheEntries(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => /r15|startup-presentation/i.test(k))
        .map((k) => caches.delete(k).catch(() => false))
    );
  } catch {
    /* ignore */
  }
}

function purgeR15WebStorage(): void {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const remove: string[] = [];
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key) continue;
        if (/r15|startup-presentation|startup_presentation/i.test(key)) {
          remove.push(key);
        }
      }
      for (const key of remove) store.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Idempotent: safe to call on every cold boot during abandonment window. */
export async function purgeAbandonedR15LocalState(): Promise<void> {
  if (typeof window === "undefined") return;
  purgeR15WebStorage();
  await deleteIndexedDb(R15_INDEXED_DB_NAME);
  await purgeR15CacheEntries();
}
