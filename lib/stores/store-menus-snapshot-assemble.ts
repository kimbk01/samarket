/**
 * Parse unified store menus snapshot RPC payload → StoreMenusCatalogBody (CPU-only downstream).
 */
import type { StoreMenusCatalogBody } from "@/lib/stores/store-menus-catalog-assemble";
import { assembleStoreMenusCatalogBodyFromParts } from "@/lib/stores/store-menus-catalog-assemble";
import type { StorePopularMenuStatRow } from "@/lib/stores/query-store-popular-menu-stats";

export type StoreMenusSnapshotPayloadJson = {
  store?: Record<string, unknown> | null;
  products?: unknown[];
  popular_stats?: unknown[];
  commerce?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  menu_version?: string;
  updated_at?: string;
};

function readInt(v: unknown, fallback: number): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
}

function parsePopularStats(raw: unknown[]): StorePopularMenuStatRow[] {
  const out: StorePopularMenuStatRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const product_id = String(r.product_id ?? "").trim();
    if (!product_id) continue;
    out.push({
      product_id,
      total_qty: Number(r.total_qty) || 0,
      last_ordered_at: String(r.last_ordered_at ?? ""),
    });
  }
  return out;
}

export function parseStoreMenusSnapshotPayload(
  payload: StoreMenusSnapshotPayloadJson
): StoreMenusCatalogBody | null {
  const storeRaw = payload.store;
  if (!storeRaw || typeof storeRaw !== "object") return null;

  const products = Array.isArray(payload.products) ? payload.products : [];
  const popularStats = parsePopularStats(Array.isArray(payload.popular_stats) ? payload.popular_stats : []);
  const commerceRaw = payload.commerce && typeof payload.commerce === "object" ? payload.commerce : {};
  const metaRaw = payload.meta && typeof payload.meta === "object" ? payload.meta : {};

  const menuSoldOutBottom = storeRaw.menu_sold_out_bottom === true;
  const publicStore = {
    id: String(storeRaw.id ?? ""),
    slug: String(storeRaw.slug ?? ""),
    store_name: String(storeRaw.store_name ?? ""),
    menu_sold_out_bottom: menuSoldOutBottom,
  };

  return assembleStoreMenusCatalogBodyFromParts({
    publicStore,
    menuSoldOutBottom,
    productsRows: products as Record<string, unknown>[],
    popularStats,
    canSell: metaRaw.can_sell === true,
    favoriteCount: readInt(metaRaw.favorite_count, 0),
    recentOrderCount: readInt(metaRaw.recent_order_count, 0),
    viewerFavorited: metaRaw.viewer_favorited === true,
    popularMenuWindowDays: readInt(commerceRaw.popular_menu_window_days, 30),
    popularMenuMinQty: readInt(commerceRaw.popular_menu_min_qty, 1),
    popularMenuTopN: readInt(commerceRaw.popular_menu_top_n, 5),
    popularMenuRecommendedMax: readInt(commerceRaw.popular_menu_recommended_max, 10),
  });
}

export function parseStoreMenusSnapshotRpcData(data: unknown): StoreMenusSnapshotPayloadJson | null {
  if (!data || typeof data !== "object") return null;
  return data as StoreMenusSnapshotPayloadJson;
}
