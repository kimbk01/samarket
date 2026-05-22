import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  getApprovedStoreBySlug,
  STORE_SELECT_SUMMARY,
} from "@/lib/stores/get-approved-store-by-slug";
import { loadStorePublicMetaBundleCached } from "@/lib/stores/load-store-commerce-meta-cached";

export type StoreSummaryPublicBody = {
  ok: boolean;
  store: Record<string, unknown> | null;
  meta: Record<string, unknown>;
  error?: string;
};

export type FetchStoreSummaryPublicResult = {
  body: StoreSummaryPublicBody;
  status: number;
  queryCount: number;
  dbMs: number;
  cacheHit: boolean;
};

/**
 * GET /api/stores/:slug/summary 본문 — store 조회와 auth 병렬, meta bundle 캐시/singleflight.
 */
export async function fetchStoreSummaryPublic(
  sb: SupabaseClient,
  decodedSlug: string
): Promise<FetchStoreSummaryPublicResult> {
  const t0 = performance.now();
  let queryCount = 0;

  const [storeRes, viewerId] = await Promise.all([
    getApprovedStoreBySlug(sb, decodedSlug, STORE_SELECT_SUMMARY),
    getRouteUserId(),
  ]);
  queryCount += 1;

  if (storeRes.ok === false) {
    const dbMs = Math.round(performance.now() - t0);
    if (storeRes.reason === "db_error") {
      return {
        body: { ok: false, store: null, meta: { source: "supabase" }, error: storeRes.message },
        status: 500,
        queryCount,
        dbMs,
        cacheHit: false,
      };
    }
    return {
      body: { ok: true, store: null, meta: { source: "supabase" } },
      status: 404,
      queryCount,
      dbMs,
      cacheHit: false,
    };
  }

  const store = storeRes.store;
  const storeId = String(store.id ?? "");
  const { meta, orderability } = await loadStorePublicMetaBundleCached(
    sb,
    storeId,
    viewerId,
    store.owner_user_id
  );
  queryCount += 4;

  const publicStore = { ...store };
  delete (publicStore as { owner_user_id?: unknown }).owner_user_id;

  const dbMs = Math.round(performance.now() - t0);
  return {
    body: {
      ok: true,
      store: publicStore,
      meta: {
        canSell: meta.canSell,
        source: "supabase",
        favorite_count: meta.favoriteCount,
        recent_order_count: meta.recentOrderCount,
        viewer_favorited: meta.viewerFavorited,
        ...orderability,
      },
    },
    status: 200,
    queryCount,
    dbMs,
    cacheHit: false,
  };
}
