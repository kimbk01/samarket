/** GET /api/stores/browse-featured-items — browse 카드 메뉴 미리보기 전용 */

/** browse·home-feed 카드 가로 스크롤 메뉴 썸네일 — `StoreDeliveryRowCard` 와 동일 상한 */
export const BROWSE_FEATURED_ITEMS_PER_STORE_MAX = 6;
export const BROWSE_FEATURED_ITEMS_BATCH_STORE_CAP = 32;

export type BrowseFeaturedItemDto = {
  id: string;
  name: string;
  thumbnail_url: string | null;
  price: number;
  badge: string | null;
};

export type BrowseFeaturedItemsByStoreDto = {
  featuredItems: BrowseFeaturedItemDto[];
};

/** 클라 `StoreRowCardData.featuredItems` 와 동일 의미 */
export type BrowseFeaturedCardItem = {
  productId: string;
  name: string;
  price: number;
  imageUrl: string | null;
};

export function mapFeaturedDtoToCardItems(
  items: BrowseFeaturedItemDto[] | undefined
): BrowseFeaturedCardItem[] {
  if (!items?.length) return [];
  return items.map((x) => ({
    productId: String(x.id),
    name: String(x.name ?? ""),
    price: Number(x.price) || 0,
    imageUrl: x.thumbnail_url?.trim() || null,
  }));
}

export function buildFeaturedMenuPreviewLine(items: BrowseFeaturedCardItem[]): string | null {
  if (!items.length) return null;
  return items
    .slice(0, 3)
    .map((x) => x.name)
    .join(", ")
    .trim() || null;
}
