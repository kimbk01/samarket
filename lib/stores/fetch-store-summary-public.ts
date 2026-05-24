import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import {
  getApprovedStoreBySlug,
  STORE_SELECT_SUMMARY,
  type StoreCommerceMeta,
} from "@/lib/stores/get-approved-store-by-slug";
import { peekStoreCommerceMetaCached, resolveStoreOrderabilityCached } from "@/lib/stores/load-store-commerce-meta-cached";

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
 * GET /api/stores/:slug/summary 본문 — hero·영업 상태 중심.
 * 찜/주문 집계는 캐시 hit 시만 포함(없으면 0 — `/menus` 병렬 응답이 보강).
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

  const cachedMeta = peekStoreCommerceMetaCached(storeId, viewerId);
  const canSellP = sb
    .from("store_sales_permissions")
    .select("allowed_to_sell, sales_status")
    .eq("store_id", storeId)
    .maybeSingle();
  queryCount += 1;

  const orderabilityP = resolveStoreOrderabilityCached(sb, viewerId, store.owner_user_id);
  const viewerIsOwner =
    Boolean(viewerId?.trim()) &&
    String(store.owner_user_id ?? "").trim().length > 0 &&
    String(store.owner_user_id ?? "").trim() === viewerId!.trim();
  if (viewerIsOwner) queryCount += 1;

  const [permRes, orderability] = await Promise.all([canSellP, orderabilityP]);
  const perm = permRes.data;
  const canSell = !!perm && perm.allowed_to_sell === true && perm.sales_status === "approved";

  const meta: StoreCommerceMeta = {
    ...(cachedMeta ?? {
      favoriteCount: 0,
      recentOrderCount: 0,
      viewerFavorited: false,
      canSell: false,
    }),
    canSell,
  };

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
    cacheHit: Boolean(cachedMeta),
  };
}
