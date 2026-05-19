/**
 * Hub badge store_attention — `get_owner_hub_store_attention_counts` process memory TTL.
 */

import type { OwnerHubStoreAttentionCounts } from "@/lib/stores/get-owner-hub-store-attention-counts";

const DEFAULT_TTL_MS = 5_000;

type MemoryEntry = {
  counts: OwnerHubStoreAttentionCounts;
  cachedAt: number;
  expiresAt: number;
};

const memoryByStoreId = new Map<string, MemoryEntry>();

export function hubStoreAttentionMemoryTtlMs(): number {
  const raw = process.env.HUB_BADGE_STORE_ATTENTION_MEMORY_TTL_MS?.trim();
  const n = raw ? Number(raw) : DEFAULT_TTL_MS;
  if (!Number.isFinite(n) || n < 3_000) return DEFAULT_TTL_MS;
  return Math.min(30_000, Math.max(3_000, Math.floor(n)));
}

export function invalidateHubStoreAttentionMemory(hubStoreId?: string): void {
  if (hubStoreId?.trim()) {
    memoryByStoreId.delete(hubStoreId.trim());
    return;
  }
  memoryByStoreId.clear();
}

function pruneExpired(now: number) {
  for (const [key, row] of memoryByStoreId) {
    if (row.expiresAt <= now) memoryByStoreId.delete(key);
  }
  while (memoryByStoreId.size > 500) {
    const first = memoryByStoreId.keys().next().value;
    if (first === undefined) break;
    memoryByStoreId.delete(first);
  }
}

export type HubStoreAttentionMemoryRead =
  | { hit: false; reason: "miss" | "expired" }
  | { hit: true; counts: OwnerHubStoreAttentionCounts; ageMs: number };

export function readHubStoreAttentionMemory(storeId: string): HubStoreAttentionMemoryRead {
  const sid = storeId.trim();
  if (!sid) return { hit: false, reason: "miss" };
  const now = Date.now();
  pruneExpired(now);
  const row = memoryByStoreId.get(sid);
  if (!row) return { hit: false, reason: "miss" };
  if (row.expiresAt <= now) {
    memoryByStoreId.delete(sid);
    return { hit: false, reason: "expired" };
  }
  return { hit: true, counts: row.counts, ageMs: Math.max(0, now - row.cachedAt) };
}

export function writeHubStoreAttentionMemory(
  storeId: string,
  counts: OwnerHubStoreAttentionCounts
): void {
  const sid = storeId.trim();
  if (!sid) return;
  const now = Date.now();
  const ttl = hubStoreAttentionMemoryTtlMs();
  memoryByStoreId.set(sid, {
    counts,
    cachedAt: now,
    expiresAt: now + ttl,
  });
  pruneExpired(now);
}
