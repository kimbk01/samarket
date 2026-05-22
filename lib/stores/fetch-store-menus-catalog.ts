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
  buildRecommendedStripProductIds,
  parseStoreDetailProducts,
  RECOMMENDED_MENU_STRIP_MAX,
  slicePopularMenuProducts,
  sortStoreDetailProductCardsForDisplay,
} from "@/lib/stores/group-store-products-by-menu";
import { loadStoreCommerceMetaCached } from "@/lib/stores/load-store-commerce-meta-cached";
import { queryStorePopularMenuStatsCached } from "@/lib/stores/store-popular-menu-stats-cache";

const STORE_PRODUCTS_MENUS_SELECT_WITH_HAS_OPTIONS =
  "id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory, min_order_qty, max_order_qty, product_status, thumbnail_url, pickup_available, local_delivery_available, shipping_available, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, has_options, store_menu_sections ( id, name, sort_order, is_hidden )";

const STORE_PRODUCTS_MENUS_SELECT_LEGACY =
  "id, title, summary, price, discount_price, discount_percent, stock_qty, track_inventory, min_order_qty, max_order_qty, product_status, thumbnail_url, pickup_available, local_delivery_available, shipping_available, menu_section_id, item_type, is_featured, is_owner_recommended, is_representative, sort_order, options_json, store_menu_sections ( id, name, sort_order, is_hidden )";

function menuRowHasOptions(optionsJson: unknown): boolean {
  if (optionsJson == null) return false;
  if (Array.isArray(optionsJson)) return optionsJson.length > 0;
  if (typeof optionsJson === "string") {
    const t = optionsJson.trim();
    return t.length > 0 && t !== "[]" && t !== "null";
  }
  if (typeof optionsJson === "object") {
    return Object.keys(optionsJson as object).length > 0;
  }
  return false;
}

function buildMenuProductRow(row: Record<string, unknown>): Record<string, unknown> {
  const hasOptionsCol = row.has_options;
  const has_options =
    typeof hasOptionsCol === "boolean" ? hasOptionsCol : menuRowHasOptions(row.options_json);
  const options_summary = has_options ? "옵션 있음" : "";
  const { options_json: _omit, has_options: _ho, ...rest } = row;
  return {
    ...rest,
    has_options,
    options_summary,
  };
}

export type StoreMenusCatalogBody = {
  ok: boolean;
  store: { id: string; slug: string; store_name: string; menu_sold_out_bottom: boolean } | null;
  products: unknown[];
  recommendedProductIds: string[];
  popularProductIds: string[];
  recommendedProducts: unknown[];
  popularProducts: unknown[];
  categories: unknown[];
  meta: Record<string, unknown>;
  error?: string;
};

export type FetchStoreMenusCatalogResult =
  | { ok: true; body: StoreMenusCatalogBody; marks: DeliveryMenusApiPhaseMarks; queryCount: number; dbMs: number }
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

  const [storeRes, viewerId, commerce] = await Promise.all([
    getApprovedStoreBySlug(sb, decodedSlug, STORE_SELECT_MENUS_STORE),
    getRouteUserId(),
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

  const metaPromise = loadStoreCommerceMetaCached(sb, storeId, viewerId);
  const productsPromise = fetchStoreProductsForMenus(sb, storeId);
  const popularPromise = queryStorePopularMenuStatsCached(
    sb,
    storeId,
    commerce.popularMenuWindowDays,
    commerce.popularMenuTopN
  );

  const [meta, productsPack, popularStats] = await Promise.all([
    metaPromise,
    productsPromise,
    popularPromise,
  ]);
  marks.metaDone = performance.now();
  marks.productsDone = performance.now();
  marks.popularDone = performance.now();
  queryCount += 3 + productsPack.queryCount;

  let products: unknown[] = [];
  let recommendedProductIds: string[] = [];
  let popularProductIds: string[] = [];

  if (meta.canSell) {
    const raw = productsPack.rows.filter((row) => {
      const sec = row.store_menu_sections;
      const o = Array.isArray(sec) ? sec[0] : sec;
      if (!o || typeof o !== "object") return true;
      return (o as { is_hidden?: boolean }).is_hidden !== true;
    });
    products = raw.map((r) => buildMenuProductRow(r));

    const cards = sortStoreDetailProductCardsForDisplay(parseStoreDetailProducts(products));
    const popularCards = slicePopularMenuProducts(cards, popularStats, commerce.popularMenuMinQty);
    popularProductIds = popularCards.map((c) => c.id);

    const stripCap = Math.min(
      RECOMMENDED_MENU_STRIP_MAX,
      Math.max(1, Math.floor(commerce.popularMenuRecommendedMax) || RECOMMENDED_MENU_STRIP_MAX)
    );
    recommendedProductIds = buildRecommendedStripProductIds(popularProductIds, cards, stripCap);
  }

  marks.payloadDone = performance.now();
  const dbMs = Math.round(marks.payloadDone - startedAt);

  return {
    ok: true,
    body: {
      ok: true,
      store: publicStore,
      products,
      recommendedProductIds,
      popularProductIds,
      recommendedProducts: [],
      popularProducts: [],
      categories: [],
      meta: {
        canSell: meta.canSell,
        source: "supabase",
        favorite_count: meta.favoriteCount,
        recent_order_count: meta.recentOrderCount,
        viewer_favorited: meta.viewerFavorited,
        menu_sold_out_bottom: menuSoldOutBottom,
        popular_menu: {
          window_days: commerce.popularMenuWindowDays,
          min_qty: commerce.popularMenuMinQty,
          top_n: commerce.popularMenuTopN,
          recommended_max: commerce.popularMenuRecommendedMax,
        },
      },
    },
    marks,
    queryCount,
    dbMs,
  };
}
