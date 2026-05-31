import type { StoreDetailProductCard } from "@/lib/stores/group-store-products-by-menu";

export type StoreMenuReviewRailProduct = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  is_representative: boolean;
};

export const STORE_MENU_REVIEW_RAIL_MAX = 8;

/** 카테고리 상단 레일 — 대표 → 인기 → 추천 → 전체 순, 중복 제거 */
export function buildStoreMenuReviewRailProducts(input: {
  popularMenuCards: StoreDetailProductCard[];
  recommendedMenuCards: StoreDetailProductCard[];
  menuSectionItems: StoreDetailProductCard[];
  maxItems?: number;
}): StoreMenuReviewRailProduct[] {
  const cap = input.maxItems ?? STORE_MENU_REVIEW_RAIL_MAX;
  const seen = new Set<string>();
  const out: StoreMenuReviewRailProduct[] = [];

  const push = (cards: StoreDetailProductCard[]) => {
    for (const c of cards) {
      const id = String(c.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        title: String(c.title ?? "").trim() || id,
        thumbnail_url: c.thumbnail_url?.trim() || null,
        is_representative: c.is_representative === true,
      });
      if (out.length >= cap) return;
    }
  };

  const all = [
    ...input.popularMenuCards,
    ...input.recommendedMenuCards,
    ...input.menuSectionItems,
  ];
  push(all.filter((c) => c.is_representative));
  if (out.length < cap) push(input.popularMenuCards);
  if (out.length < cap) push(input.recommendedMenuCards);
  if (out.length < cap) push(input.menuSectionItems);

  return out;
}

export type StoreMenuReviewRailReviewRow = {
  product_id?: string | null;
};

export type StoreMenuReviewRailItem = StoreMenuReviewRailProduct & { reviewCount: number };

export function attachReviewCountsToRailProducts(
  menuProducts: StoreMenuReviewRailProduct[],
  reviews: StoreMenuReviewRailReviewRow[]
): StoreMenuReviewRailItem[] {
  const countByProduct = new Map<string, number>();
  for (const r of reviews) {
    const pid = String(r.product_id ?? "").trim();
    if (!pid) continue;
    countByProduct.set(pid, (countByProduct.get(pid) ?? 0) + 1);
  }
  return menuProducts.map((p) => ({
    ...p,
    reviewCount: countByProduct.get(p.id) ?? 0,
  }));
}

/** API flat rows → 대표 우선 레일 목록 */
export function buildStoreMenuReviewRailFromFlatProducts(
  rows: StoreMenuReviewRailProduct[]
): StoreMenuReviewRailProduct[] {
  const seen = new Set<string>();
  const rep: StoreMenuReviewRailProduct[] = [];
  const rest: StoreMenuReviewRailProduct[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    (row.is_representative ? rep : rest).push(row);
  }
  return [...rep, ...rest].slice(0, STORE_MENU_REVIEW_RAIL_MAX);
}
