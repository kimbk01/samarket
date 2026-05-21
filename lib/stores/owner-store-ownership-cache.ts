import type { SupabaseClient } from "@supabase/supabase-js";
import { getStoreIfOwner, type StoreGateRow } from "@/lib/stores/owner-product-gate";

type GateResult =
  | { ok: true; store: StoreGateRow }
  | { ok: false; status: number; error: string };

/** 허브·주문 탭 폴링(25~30s) 동안 동일 user+store ownership 재조회 방지 */
export const OWNER_STORE_OWNERSHIP_TTL_MS = 30_000;

type OwnerOwnershipCacheGlobal = {
  __samarketOwnerStoreOwnershipCache?: Map<string, { expiresAt: number; gate: GateResult }>;
};

function cache(): Map<string, { expiresAt: number; gate: GateResult }> {
  const g = globalThis as OwnerOwnershipCacheGlobal;
  if (!g.__samarketOwnerStoreOwnershipCache) {
    g.__samarketOwnerStoreOwnershipCache = new Map();
  }
  return g.__samarketOwnerStoreOwnershipCache;
}

function cacheKey(userId: string, storeId: string): string {
  return `${userId.trim()}::${storeId.trim()}`;
}

export function peekOwnerStoreOwnershipCacheHit(userId: string, storeId: string): boolean {
  const key = cacheKey(userId, storeId);
  if (!key || key === "::") return false;
  const hit = cache().get(key);
  return !!hit && hit.expiresAt > Date.now();
}

export function invalidateOwnerStoreOwnershipCache(userId?: string, storeId?: string): void {
  const map = cache();
  if (!userId?.trim() && !storeId?.trim()) {
    map.clear();
    return;
  }
  const u = userId?.trim() ?? "";
  const s = storeId?.trim() ?? "";
  for (const key of map.keys()) {
    if (u && s && key === cacheKey(u, s)) {
      map.delete(key);
      continue;
    }
    if (s && key.endsWith(`::${s}`)) map.delete(key);
    if (u && key.startsWith(`${u}::`)) map.delete(key);
  }
}

export async function getCachedStoreIfOwner(
  sb: SupabaseClient<any>,
  userId: string,
  storeId: string
): Promise<GateResult> {
  const key = cacheKey(userId, storeId);
  if (!key || key === "::") {
    return getStoreIfOwner(sb, userId, storeId);
  }

  const now = Date.now();
  const hit = cache().get(key);
  if (hit && hit.expiresAt > now) {
    return hit.gate;
  }

  const gate = await getStoreIfOwner(sb, userId, storeId);
  cache().set(key, { gate, expiresAt: now + OWNER_STORE_OWNERSHIP_TTL_MS });
  while (cache().size > 400) {
    const k = cache().keys().next().value;
    if (k === undefined) break;
    cache().delete(k);
  }
  return gate;
}

/** dashboard snapshot RPC 성공 후 — 다른 owner 라우트용 ownership TTL 시드 */
export function seedOwnerStoreOwnershipCache(
  userId: string,
  storeId: string,
  gate: GateResult
): void {
  const key = cacheKey(userId, storeId);
  if (!key || key === "::") return;
  cache().set(key, { gate, expiresAt: Date.now() + OWNER_STORE_OWNERSHIP_TTL_MS });
}
