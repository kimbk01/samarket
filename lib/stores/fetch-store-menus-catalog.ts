import type { SupabaseClient } from "@supabase/supabase-js";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import type { DeliveryMenusApiPhaseMarks } from "@/lib/stores/delivery-menus-api-breakdown";
import {
  getApprovedStoreBySlug,
  loadStoreCommerceMeta,
  STORE_SELECT_MENUS_STORE,
} from "@/lib/stores/get-approved-store-by-slug";
import { loadCommerceSettingsCached } from "@/lib/stores/load-commerce-settings-cached";
import {
  assembleStoreMenusCatalogBodyFromParts,
  buildMenuProductRow,
  type StoreMenusCatalogBody,
} from "@/lib/stores/store-menus-catalog-assemble";
import { loadStoreCommerceMetaCached } from "@/lib/stores/load-store-commerce-meta-cached";
import { queryStorePopularMenuStatsCached } from "@/lib/stores/store-popular-menu-stats-cache";
import { tryLoadStoreMenusCatalogFromSnapshot } from "@/lib/stores/store-menus-snapshot";

export type { StoreMenusCatalogBody } from "@/lib/stores/store-menus-catalog-assemble";

const STORE_PRODUCTS_MENUS_SELECT_WITH_HAS_OPTIONS =
  "id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory, min_order_qty, max_order_qty, product_status, thumbnail_url, pickup_available, local_delivery_available, shipping_available, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, has_options, store_menu_sections ( id, name, sort_order, is_hidden )";

const STORE_PRODUCTS_MENUS_SELECT_LEGACY =
  "id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory, min_order_qty, max_order_qty, product_status, thumbnail_url, pickup_available, local_delivery_available, shipping_available, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, options_json, store_menu_sections ( id, name, sort_order, is_hidden )";

export type FetchStoreMenusCatalogResult =
  | {
      ok: true;
      body: StoreMenusCatalogBody;
      marks: DeliveryMenusApiPhaseMarks;
      queryCount: number;
      dbMs: number;
      snapshotVia?: "counter_row" | "unified_rpc";
    }
  | {
      ok: false;
      status: number;
      body: Record<string, unknown>;
      marks: DeliveryMenusApiPhaseMarks;
      queryCount: number;
      dbMs: number;
    };

async function fetchStoreProductsForMenus(
  sb: SupabaseClient,
  storeId: string
): Promise<{ rows: Record<string, unknown>[]; queryCount: number }> {
  const base = sb
    .from("store_products")
    .select(STORE_PRODUCTS_MENUS_SELECT_WITH_HAS_OPTIONS)
    .eq("store_id", storeId)
    .in("product_status", ["active", "sold_out"])
    .order("sort_order", { ascending: true })
    .limit(120);

  const { data, error } = await base;

  if (!error) {
    return { rows: (data ?? []) as Record<string, unknown>[], queryCount: 1 };
  }

  const msg = String(error.message ?? "");
  if (!msg.includes("has_options")) {
    console.error("[fetch-store-menus-catalog] products", error);
    return { rows: [], queryCount: 1 };
  }

  const legacy = await sb
    .from("store_products")
    .select(STORE_PRODUCTS_MENUS_SELECT_LEGACY)
    .eq("store_id", storeId)
    .in("product_status", ["active", "sold_out"])
    .order("sort_order", { ascending: true })
    .limit(120);

  if (legacy.error) console.error("[fetch-store-menus-catalog] products legacy", legacy.error);
  return { rows: (legacy.data ?? []) as Record<string, unknown>[], queryCount: 2 };
}

export async function fetchStoreMenusCatalog(
  sb: SupabaseClient,
  decodedSlug: string,
  startedAt: number
): Promise<FetchStoreMenusCatalogResult> {
  const marks: DeliveryMenusApiPhaseMarks = { authDone: startedAt };
  let queryCount = 0;

  const viewerId = await getRouteUserId();
  marks.authDone = performance.now();

  const snapResult = await tryLoadStoreMenusCatalogFromSnapshot(sb, decodedSlug, viewerId, startedAt);
  if (snapResult) {
    marks.storeDone = performance.now();
    marks.productsDone = marks.storeDone;
    marks.popularDone = marks.storeDone;
    marks.metaDone = marks.storeDone;
    marks.payloadDone = performance.now();
    return {
      ok: true,
      body: snapResult.body,
      marks,
      queryCount: snapResult.breakdown.round_trips,
      dbMs: snapResult.breakdown.db_ms,
      snapshotVia: snapResult.breakdown.snapshot_via === "counter_row" ? "counter_row" : "unified_rpc",
    };
  }

  {
    const { auditLegacyFallbackUsage } = await import("@/lib/ops/legacy-fallback-usage-audit");
    auditLegacyFallbackUsage({
      route: "/api/stores/[slug]/menus",
      fallback_branch: "legacy_products_popular_meta",
      reason: "unified_rpc_unavailable",
    });
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- snapshot deploy probe
    console.warn("[store-menus-snapshot-fallback]", {
      slug: decodedSlug,
      reason: "unified_rpc_unavailable",
    });
  }

  const [storeRes, commerce] = await Promise.all([
    getApprovedStoreBySlug(sb, decodedSlug, STORE_SELECT_MENUS_STORE),
    loadCommerceSettingsCached(sb),
  ]);
  marks.authDone = performance.now();
  queryCount += 1;

  if (storeRes.ok === false) {
    marks.storeDone = performance.now();
    const dbMs = Math.round(marks.storeDone - startedAt);
    if (storeRes.reason === "db_error") {
      return {
        ok: false,
        status: 500,
        body: { ok: false, error: storeRes.message },
        marks,
        queryCount,
        dbMs,
      };
    }
    return {
      ok: false,
      status: 404,
      body: {
        ok: true,
        store: null,
        products: [],
        recommendedProductIds: [],
        popularProductIds: [],
        recommendedProducts: [],
        popularProducts: [],
        categories: [],
        meta: { source: "supabase", canSell: false, menu_sold_out_bottom: false },
      },
      marks,
      queryCount,
      dbMs,
    };
  }

  const store = storeRes.store;
  const storeId = String(store.id ?? "");
  marks.storeDone = performance.now();

  const menuSoldOutBottom = store.menu_sold_out_bottom === true;
  const publicStore = {
    id: storeId,
    slug: String(store.slug ?? ""),
    store_name: String(store.store_name ?? ""),
    menu_sold_out_bottom: menuSoldOutBottom,
  };

  const metaPromise = loadStoreCommerceMetaCached(sb, storeId, viewerId).then((value) => {
    marks.metaDone = performance.now();
    return value;
  });
  const productsPromise = fetchStoreProductsForMenus(sb, storeId).then((value) => {
    marks.productsDone = performance.now();
    return value;
  });
  const popularPromise = queryStorePopularMenuStatsCached(
    sb,
    storeId,
    commerce.popularMenuWindowDays,
    commerce.popularMenuTopN
  ).then((value) => {
    marks.popularDone = performance.now();
    return value;
  });

  const [meta, productsPack, popularStats] = await Promise.all([metaPromise, productsPromise, popularPromise]);
  queryCount += 3 + productsPack.queryCount;

  const body = assembleStoreMenusCatalogBodyFromParts({
    publicStore,
    menuSoldOutBottom,
    productsRows: productsPack.rows,
    popularStats,
    canSell: meta.canSell,
    favoriteCount: meta.favoriteCount,
    recentOrderCount: meta.recentOrderCount,
    viewerFavorited: meta.viewerFavorited,
    popularMenuWindowDays: commerce.popularMenuWindowDays,
    popularMenuMinQty: commerce.popularMenuMinQty,
    popularMenuTopN: commerce.popularMenuTopN,
    popularMenuRecommendedMax: commerce.popularMenuRecommendedMax,
  });

  marks.payloadDone = performance.now();
  const dbMs = Math.round(marks.payloadDone - startedAt);

  return {
    ok: true,
    body,
    marks,
    queryCount,
    dbMs,
  };
}
