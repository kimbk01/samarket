import {
  buildRecommendedStripProductIds,
  parseStoreDetailProducts,
  RECOMMENDED_MENU_STRIP_MAX,
  sortStoreDetailProductCardsForDisplay,
  type StoreDetailProductCard,
} from "@/lib/stores/group-store-products-by-menu";
import type { StoreMenusPayload } from "@/lib/stores/store-detail-split-types";
import { storePublicProductRowsMap } from "@/lib/stores/store-public-page-hydrate";

/** 첫 viewport — 상품 카드·섹션 그룹핑에 필요한 최소 정규화 */
export type StoreMenusCoreApply = {
  products: StoreDetailProductCard[];
  productRowsById: Record<string, Record<string, unknown>>;
  canSell: boolean;
  menuSoldOutBottom: boolean;
};

/** idle/deferred — 추천·인기 스트립·메타 */
export type StoreMenusStripsApply = {
  recommendedMenuCards: StoreDetailProductCard[];
  popularMenuCards: StoreDetailProductCard[];
  favoriteSeed: { viewerFavorited: boolean; favoriteCount: number };
  recentOrderCountMeta: number;
};

export function buildStoreMenusCoreApply(menuParsed: StoreMenusPayload): StoreMenusCoreApply {
  const raw = menuParsed.products ?? [];
  const popIds = Array.isArray(menuParsed.popularProductIds) ? menuParsed.popularProductIds : [];
  const nextProducts = sortStoreDetailProductCardsForDisplay(parseStoreDetailProducts(raw));

  const byId = new Map(nextProducts.map((c) => [c.id, c]));
  const nextPop = popIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((c, i) => ({ ...(c as StoreDetailProductCard), popular_rank: i + 1 }));

  const popularRankById = new Map(nextPop.map((c) => [c.id, c.popular_rank ?? 0]));
  const products = nextProducts.map((p) => {
    const r = popularRankById.get(p.id);
    return r != null && r > 0 ? { ...p, popular_rank: r } : { ...p, popular_rank: p.popular_rank ?? null };
  });

  const sob =
    menuParsed.meta?.menu_sold_out_bottom === true ||
    menuParsed.store?.menu_sold_out_bottom === true;

  return {
    products,
    productRowsById: storePublicProductRowsMap(raw),
    canSell: !!menuParsed.meta?.canSell,
    menuSoldOutBottom: sob,
  };
}

export function buildStoreMenusStripsApply(
  menuParsed: StoreMenusPayload,
  products: StoreDetailProductCard[]
): StoreMenusStripsApply {
  const popIds = Array.isArray(menuParsed.popularProductIds) ? menuParsed.popularProductIds : [];
  const stripCap = Math.min(
    RECOMMENDED_MENU_STRIP_MAX,
    Math.max(
      1,
      Math.floor(Number(menuParsed.meta?.popular_menu?.recommended_max)) || RECOMMENDED_MENU_STRIP_MAX
    )
  );
  const recIds =
    Array.isArray(menuParsed.recommendedProductIds) && menuParsed.recommendedProductIds.length > 0
      ? menuParsed.recommendedProductIds
      : buildRecommendedStripProductIds(popIds, products, stripCap);

  const byId = new Map(products.map((c) => [c.id, c]));
  const nextPop = popIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((c, i) => ({ ...(c as StoreDetailProductCard), popular_rank: i + 1 }));

  const popularRankById = new Map(nextPop.map((c) => [c.id, c.popular_rank ?? 0]));
  const byIdRanked = new Map(
    products.map((p) => {
      const r = popularRankById.get(p.id);
      const ranked =
        r != null && r > 0 ? { ...p, popular_rank: r } : { ...p, popular_rank: p.popular_rank ?? null };
      return [p.id, ranked] as const;
    })
  );

  const recommendedMenuCards = recIds
    .map((id) => {
      const c = byIdRanked.get(id);
      if (!c) return null;
      const r = popularRankById.get(id);
      return r != null && r > 0 ? { ...c, popular_rank: r } : { ...c, popular_rank: c.popular_rank ?? null };
    })
    .filter(Boolean) as StoreDetailProductCard[];

  return {
    recommendedMenuCards,
    popularMenuCards: nextPop,
    favoriteSeed: {
      viewerFavorited: !!menuParsed.meta?.viewer_favorited,
      favoriteCount: Number(menuParsed.meta?.favorite_count) || 0,
    },
    recentOrderCountMeta: Number(menuParsed.meta?.recent_order_count) || 0,
  };
}

export function scheduleStoreMenusStripsWork(fn: () => void): void {
  if (typeof window === "undefined") {
    fn();
    return;
  }
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => fn(), { timeout: 150 });
    return;
  }
  queueMicrotask(fn);
}
