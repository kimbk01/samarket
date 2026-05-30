/**
 * Hub badge cm_unread — aggregate snapshot process memory TTL (route cache 별도).
 * key: cm-unread-snapshot:${userId}
 */

import { runSingleFlight } from "@/lib/http/run-single-flight";

/** owner-hub-badge route TTL(12s)와 맞춤 — cold 직후 warm hit */
const DEFAULT_TTL_MS = 12_000;
const STALE_MULTIPLIER = 2;

/** `sumCommunityMessengerParticipantUnread` singleflight 키 prefix — revalidate dedupe 공유 */
export const CM_UNREAD_DEDUPE_KEY_PREFIX = "cm-unread-sum:";

type MemoryEntry = {
  unreadRoomCount: number;
  cachedAt: number;
  freshUntil: number;
  staleUntil: number;
};

type CmUnreadMemoryCacheGlobal = {
  __samarketCmUnreadRoomCountMemoryCache?: Map<string, MemoryEntry>;
};

function memoryByUser(): Map<string, MemoryEntry> {
  const g = globalThis as CmUnreadMemoryCacheGlobal;
  if (!g.__samarketCmUnreadRoomCountMemoryCache) {
    g.__samarketCmUnreadRoomCountMemoryCache = new Map();
  }
  return g.__samarketCmUnreadRoomCountMemoryCache;
}

export function cmUnreadDedupeKey(userId: string): string {
  return `${CM_UNREAD_DEDUPE_KEY_PREFIX}${userId.trim()}`;
}

export function cmUnreadSnapshotMemoryCacheKey(userId: string): string {
  return `cm-unread-snapshot:${userId.trim()}`;
}

export function communityMessengerUnreadMemoryTtlMs(): number {
  const raw = process.env.HUB_BADGE_CM_UNREAD_MEMORY_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_TTL_MS;
  if (!Number.isFinite(n) || n < 3_000) return DEFAULT_TTL_MS;
  return Math.min(30_000, Math.max(3_000, Math.floor(n)));
}

export function invalidateCommunityMessengerUnreadTotalCache(userId: string): void {
  const k = userId.trim();
  if (!k) return;
  memoryByUser().delete(k);
}

function pruneExpired(now: number) {
  const mem = memoryByUser();
  for (const [key, row] of mem) {
    if (row.staleUntil <= now) mem.delete(key);
  }
  while (mem.size > 500) {
    const first = mem.keys().next().value;
    if (first === undefined) break;
    mem.delete(first);
  }
}

export type CmUnreadRoomCountMemoryRead =
  | { hit: false; reason: "miss" | "expired" }
  | { hit: true; unreadRoomCount: number; ageMs: number; stale?: boolean };

export function readCmUnreadRoomCountMemory(userId: string): CmUnreadRoomCountMemoryRead {
  const k = userId.trim();
  if (!k) return { hit: false, reason: "miss" };
  const now = Date.now();
  pruneExpired(now);
  const row = memoryByUser().get(k);
  if (!row) return { hit: false, reason: "miss" };
  if (row.staleUntil <= now) {
    memoryByUser().delete(k);
    return { hit: false, reason: "expired" };
  }
  const stale = now >= row.freshUntil;
  return {
    hit: true,
    unreadRoomCount: row.unreadRoomCount,
    ageMs: Math.max(0, now - row.cachedAt),
    ...(stale ? { stale: true } : {}),
  };
}

/** stale-while-revalidate — 응답 즉시, 백그라운드 refresh (cold RPC dedupe 공유) */
export function scheduleCmUnreadSnapshotRevalidate(
  userId: string,
  fetcher: () => Promise<number>
): void {
  const k = userId.trim();
  if (!k) return;
  void runSingleFlight(`${cmUnreadDedupeKey(k)}:revalidate`, async () => {
    try {
      const unreadRoomCount = await fetcher();
      writeCmUnreadRoomCountMemory(k, unreadRoomCount);
    } catch {
      /* keep stale snapshot */
    }
  });
}

export function writeCmUnreadRoomCountMemory(userId: string, unreadRoomCount: number): void {
  const k = userId.trim();
  if (!k) return;
  const now = Date.now();
  const freshTtl = communityMessengerUnreadMemoryTtlMs();
  const staleTtl = Math.min(freshTtl * STALE_MULTIPLIER, 60_000);
  memoryByUser().set(k, {
    unreadRoomCount: Math.max(0, Math.floor(unreadRoomCount) || 0),
    cachedAt: now,
    freshUntil: now + freshTtl,
    staleUntil: now + staleTtl,
  });
  pruneExpired(now);
}
