/**
 * Canonical post-write side effects after a successful `stores` physical-location mutation.
 *
 * ALL writers must call this (Owner PATCH, Admin set_store_location, shop-linked sync).
 * Checkout geo refresh stays separate — only when lat/lng actually change.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { clearStoreHomeFeedServerCache } from "@/lib/stores/store-home-feed-server-cache";
import { invalidateDiscoveryAfterStoreWrite } from "@/lib/stores/discovery/invalidate-discovery-after-store-write";
import { invalidateStorePublicCachesForSlugOnServer } from "@/lib/stores/store-public-cache-invalidate-server";
import { invalidateMeStoresListServerCache } from "@/lib/me/load-me-stores-for-user";

export type AfterCanonicalStoreLocationWriteInput = {
  sb: SupabaseClient;
  storeId: string;
  /** Patch keys written to `stores` (drives discovery reason selection). */
  patch: Record<string, unknown>;
  slug?: string | null;
  /** Owner user id — clears Owner me-stores list cache when present. */
  ownerUserId?: string | null;
};

/**
 * Shared invalidation contract for store physical address / pin writes.
 * - discovery projections (geo / related reasons from patch)
 * - HOME feed in-memory cache (process-local clear)
 * - public slug caches when slug known
 * - Owner me-stores list cache when ownerUserId known
 */
export async function afterCanonicalStoreLocationWrite(
  input: AfterCanonicalStoreLocationWriteInput
): Promise<void> {
  const sid = String(input.storeId ?? "").trim();
  if (!sid) return;

  /** 정책 버전 올리기(매장 행 갱신)가 끝난 뒤 캐시를 지워야 다시 읽은 목록에 최신 `updated_at` 이 담긴다. */
  await invalidateDiscoveryAfterStoreWrite(input.sb, sid, input.patch);
  clearStoreHomeFeedServerCache();

  const slug = String(input.slug ?? "").trim();
  if (slug) {
    try {
      invalidateStorePublicCachesForSlugOnServer(slug);
    } catch {
      /* best-effort */
    }
  }

  const ownerUserId = String(input.ownerUserId ?? "").trim();
  if (ownerUserId) {
    invalidateMeStoresListServerCache(ownerUserId);
  }
}
