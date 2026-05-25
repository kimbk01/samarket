/**
 * Shared store menus catalog CPU assembly — snapshot and legacy paths must match.
 */
import {
  buildRecommendedStripProductIds,
  parseStoreDetailProducts,
  RECOMMENDED_MENU_STRIP_MAX,
  slicePopularMenuProducts,
  sortStoreDetailProductCardsForDisplay,
} from "@/lib/stores/group-store-products-by-menu";
import type { StorePopularMenuStatRow } from "@/lib/stores/query-store-popular-menu-stats";

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

export function buildMenuProductRow(row: Record<string, unknown>): Record<string, unknown> {
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

export function assembleStoreMenusCatalogBodyFromParts(input: {
  publicStore: { id: string; slug: string; store_name: string; menu_sold_out_bottom: boolean };
  menuSoldOutBottom: boolean;
  productsRows: Record<string, unknown>[];
  popularStats: StorePopularMenuStatRow[];
  canSell: boolean;
  favoriteCount: number;
  recentOrderCount: number;
  viewerFavorited: boolean;
  popularMenuWindowDays: number;
  popularMenuMinQty: number;
  popularMenuTopN: number;
  popularMenuRecommendedMax: number;
}): StoreMenusCatalogBody {
  let products: unknown[] = [];
  let recommendedProductIds: string[] = [];
  let popularProductIds: string[] = [];

  if (input.canSell) {
    const raw = input.productsRows.filter((row) => {
      const sec = row.store_menu_sections;
      const o = Array.isArray(sec) ? sec[0] : sec;
      if (!o || typeof o !== "object") return true;
      return (o as { is_hidden?: boolean }).is_hidden !== true;
    });
    products = raw.map((r) => buildMenuProductRow(r));

    const cards = sortStoreDetailProductCardsForDisplay(parseStoreDetailProducts(products));
    const popularCards = slicePopularMenuProducts(cards, input.popularStats, input.popularMenuMinQty);
    popularProductIds = popularCards.map((c) => c.id);

    const stripCap = Math.min(
      RECOMMENDED_MENU_STRIP_MAX,
      Math.max(1, Math.floor(input.popularMenuRecommendedMax) || RECOMMENDED_MENU_STRIP_MAX)
    );
    recommendedProductIds = buildRecommendedStripProductIds(popularProductIds, cards, stripCap);
  }

  return {
    ok: true,
    store: input.publicStore,
    products,
    recommendedProductIds,
    popularProductIds,
    recommendedProducts: [],
    popularProducts: [],
    categories: [],
    meta: {
      canSell: input.canSell,
      source: "supabase",
      favorite_count: input.favoriteCount,
      recent_order_count: input.recentOrderCount,
      viewer_favorited: input.viewerFavorited,
      menu_sold_out_bottom: input.menuSoldOutBottom,
      popular_menu: {
        window_days: input.popularMenuWindowDays,
        min_qty: input.popularMenuMinQty,
        top_n: input.popularMenuTopN,
        recommended_max: input.popularMenuRecommendedMax,
      },
    },
  };
}
