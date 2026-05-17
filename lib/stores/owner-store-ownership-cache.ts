import type { SupabaseClient } from "@supabase/supabase-js";
import { getStoreIfOwner, type StoreGateRow } from "@/lib/stores/owner-product-gate";

type GateResult =
  | { ok: true; store: StoreGateRow }
  | { ok: false; status: number; error: string };

/** 허브·주문 탭 폴링(25~30s) 동안 동일 user+store ownership 재조회 방지 */
const OWNERSHIP_TTL_MS = 30_000;

const cache = new Map<string, { expiresAt: number; gate: GateResult }>();

function cacheKey(userId: string, storeId: string): string {
  return `${userId.trim()}::${storeId.trim()}`;
}

export function peekOwnerStoreOwnershipCacheHit(userId: string, storeId: string): boolean {
  const key = cacheKey(userId, storeId);
  if (!key || key === "::") return false;
  const hit = cache.get(key);
  return !!hit && hit.expiresAt > Date.now();
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
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.gate;
  }

  const gate = await getStoreIfOwner(sb, userId, storeId);
  cache.set(key, { gate, expiresAt: now + OWNERSHIP_TTL_MS });
  while (cache.size > 400) {
    const k = cache.keys().next().value;
    if (k === undefined) break;
    cache.delete(k);
  }
  return gate;
}
