/**
 * Owner hub badge — findOwnerHubStore process-memory TTL (read-through + stale-while-revalidate).
 * PostgREST 2-step lookup remains fallback; store admin 변경 직후 TTL(기본 30s) 내 스냅샷 지연 가능.
 * key: owner-hub-store:${userId}
 */

export type HubStoreLiteCached = {
  id: string;
  slug?: string | null;
  allowed_to_sell?: boolean;
  sales_status?: string | null;
};

type MemoryEntry = {
  hubStore: HubStoreLiteCached | null;
  cachedAt: number;
  freshUntil: number;
  staleUntil: number;
};

const DEFAULT_TTL_MS = 30_000;
/** 허브 매장 없음(empty) — 동일 lookup 반복 방지 */
const DEFAULT_EMPTY_TTL_MS = 120_000;
const STALE_MULTIPLIER = 2;

const memoryByUser = new Map<string, MemoryEntry>();

const revalidateInflight = new Map<string, Promise<void>>();

export function ownerHubStoreLookupMemoryCacheKey(userId: string): string {
  return `owner-hub-store:${userId.trim()}`;
}

export function ownerHubStoreLookupMemoryTtlMs(): number {
  const raw = process.env.HUB_BADGE_OWNER_HUB_STORE_MEMORY_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_TTL_MS;
  if (!Number.isFinite(n) || n < 5_000) return DEFAULT_TTL_MS;
  return Math.min(120_000, Math.max(5_000, Math.floor(n)));
}

export function invalidateOwnerHubStoreLookupCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  memoryByUser.delete(k);
  const prefix = `${k}:`;
  for (const key of [...memoryByUser.keys()]) {
    if (key.startsWith(prefix)) memoryByUser.delete(key);
  }
}

function pruneExpired(now: number) {
  for (const [key, row] of memoryByUser) {
    if (row.staleUntil <= now) memoryByUser.delete(key);
  }
  while (memoryByUser.size > 500) {
    const first = memoryByUser.keys().next().value;
    if (first === undefined) break;
    memoryByUser.delete(first);
  }
}

export type OwnerHubStoreLookupMemoryRead =
  | { hit: false; reason: "miss" | "expired" }
  | { hit: true; hubStore: HubStoreLiteCached | null; ageMs: number; stale?: boolean };

export function readOwnerHubStoreLookupMemory(userId: string): OwnerHubStoreLookupMemoryRead {
  const k = userId.trim();
  if (!k) return { hit: false, reason: "miss" };
  const now = Date.now();
  pruneExpired(now);
  const row = memoryByUser.get(k);
  if (!row) return { hit: false, reason: "miss" };
  if (row.staleUntil <= now) {
    memoryByUser.delete(k);
    return { hit: false, reason: "expired" };
  }
  const stale = now >= row.freshUntil;
  return {
    hit: true,
    hubStore: row.hubStore,
    ageMs: Math.max(0, now - row.cachedAt),
    ...(stale ? { stale: true } : {}),
  };
}

/** stale-while-revalidate — 응답은 즉시, 백그라운드 refresh */
export function scheduleOwnerHubStoreLookupRevalidate(
  userId: string,
  fetcher: () => Promise<HubStoreLiteCached | null>
): void {
  const k = userId.trim();
  if (!k || revalidateInflight.has(k)) return;
  const flight = (async () => {
    try {
      const hubStore = await fetcher();
      writeOwnerHubStoreLookupMemory(k, hubStore);
    } catch {
      /* keep stale snapshot */
    }
  })().finally(() => {
    if (revalidateInflight.get(k) === flight) revalidateInflight.delete(k);
  });
  revalidateInflight.set(k, flight);
}

export function ownerHubStoreLookupEmptyTtlMs(): number {
  const raw = process.env.HUB_BADGE_OWNER_HUB_STORE_EMPTY_MEMORY_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_EMPTY_TTL_MS;
  if (!Number.isFinite(n) || n < 5_000) return DEFAULT_EMPTY_TTL_MS;
  return Math.min(300_000, Math.max(5_000, Math.floor(n)));
}

export function writeOwnerHubStoreLookupMemory(
  userId: string,
  hubStore: HubStoreLiteCached | null
): void {
  const k = userId.trim();
  if (!k) return;
  const now = Date.now();
  const freshTtl = hubStore ? ownerHubStoreLookupMemoryTtlMs() : ownerHubStoreLookupEmptyTtlMs();
  const staleTtl = Math.min(freshTtl * STALE_MULTIPLIER, 300_000);
  memoryByUser.set(k, {
    hubStore,
    cachedAt: now,
    freshUntil: now + freshTtl,
    staleUntil: now + staleTtl,
  });
  pruneExpired(now);
}
