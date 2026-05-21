/**
 * Owner hub badge — findOwnerHubStore process-memory TTL (read-through).
 * PostgREST embed query remains fallback; store admin 변경 직후 TTL(기본 45s) 내 스냅샷 지연 가능.
 */

export type HubStoreLiteCached = {
  id: string;
  slug?: string | null;
};

type MemoryEntry = {
  hubStore: HubStoreLiteCached | null;
  cachedAt: number;
  expiresAt: number;
};

const DEFAULT_TTL_MS = 45_000;
/** 허브 매장 없음(empty) — 동일 heavy join 반복 방지 */
const DEFAULT_EMPTY_TTL_MS = 120_000;

const memoryByUser = new Map<string, MemoryEntry>();

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
}

function pruneExpired(now: number) {
  for (const [key, row] of memoryByUser) {
    if (row.expiresAt <= now) memoryByUser.delete(key);
  }
  while (memoryByUser.size > 500) {
    const first = memoryByUser.keys().next().value;
    if (first === undefined) break;
    memoryByUser.delete(first);
  }
}

export type OwnerHubStoreLookupMemoryRead =
  | { hit: false; reason: "miss" | "expired" }
  | { hit: true; hubStore: HubStoreLiteCached | null; ageMs: number };

export function readOwnerHubStoreLookupMemory(userId: string): OwnerHubStoreLookupMemoryRead {
  const k = userId.trim();
  if (!k) return { hit: false, reason: "miss" };
  const now = Date.now();
  pruneExpired(now);
  const row = memoryByUser.get(k);
  if (!row) return { hit: false, reason: "miss" };
  if (row.expiresAt <= now) {
    memoryByUser.delete(k);
    return { hit: false, reason: "expired" };
  }
  return {
    hit: true,
    hubStore: row.hubStore,
    ageMs: Math.max(0, now - row.cachedAt),
  };
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
  const ttl = hubStore ? ownerHubStoreLookupMemoryTtlMs() : ownerHubStoreLookupEmptyTtlMs();
  memoryByUser.set(k, {
    hubStore,
    cachedAt: now,
    expiresAt: now + ttl,
  });
  pruneExpired(now);
}
