import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";

/** GET /api/stores/browse-featured-items — browse·홈 피드 카드 메뉴 미리보기(deferred) 전용 */
/** browse·home-feed 카드 가로 스크롤 메뉴 썸네일 — `StoreDeliveryRowCard` 와 동일 상한 */
export const BROWSE_FEATURED_ITEMS_PER_STORE_MAX = 6;

/** browse 인라인·deferred batch 공통 — storage 경로·LAN 호스트 URL 정규화 */
export function resolveBrowseFeaturedMenuImageUrl(
  thumbnail_url: string | null | undefined
): string | null {
  return resolveStoreProductMediaUrl(thumbnail_url);
}export const BROWSE_FEATURED_ITEMS_BATCH_STORE_CAP = 32;

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

/**
 * API `featuredItems[].thumbnail_url` — 서버 `rowToDto`에서 이미 public URL 로 정규화됨.
 * 클라는 pass-through 만 (이중 정규화·불필요 CPU 방지).
 */
export function mapFeaturedDtoToCardItems(
  items: BrowseFeaturedItemDto[] | undefined
): BrowseFeaturedCardItem[] {
  if (!items?.length) return [];
  return items.map((x) => {
    const thumb = typeof x.thumbnail_url === "string" ? x.thumbnail_url.trim() : "";
    return {
      productId: String(x.id),
      name: String(x.name ?? ""),
      price: Number(x.price) || 0,
      imageUrl: thumb || null,
    };
  });
}

export function buildFeaturedMenuPreviewLine(items: BrowseFeaturedCardItem[]): string | null {
  if (!items.length) return null;
  return items
    .slice(0, 3)
    .map((x) => x.name)
    .join(", ")
    .trim() || null;
}
