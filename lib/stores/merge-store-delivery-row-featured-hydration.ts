import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";
import { buildFeaturedMenuPreviewLine } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { StoreRowCardData } from "@/components/stores/home/StoreDeliveryRowCard";

/**
 * CONTRACT — 배달 목록(`StoreDeliveryRowCard`) 메뉴 썸네일
 *
 * - `home-feed`·`browse` 1차 응답: 매장별 `featuredItems` 에 **메뉴 thumbnail URL** (동일 product 쿼리 wave).
 * - 부족분만 `GET /api/stores/browse-featured-items` 배치로 보강.
 * - UI는 `useBrowseFeaturedItemsHydration` + 본 병합 함수를 **browse·홈 피드 모두**에 적용한다.
 *
 * DO NOT: `StoreDeliveryRowCard`에 매장 `profileImageUrl`·히어로를 메뉴 타일 fallback 으로 쓰기.
 * DO NOT: `StoreDeliveryRowCard`에 `registerBrowseListItem` 없이 deferred 목록만 렌더.
 */

export function mergeFeaturedHydrationIntoStoreRowCard(
  base: StoreRowCardData,
  hydrated: BrowseFeaturedCardItem[] | undefined
): StoreRowCardData {
  if (hydrated === undefined) return base;
  return {
    ...base,
    featuredItems: hydrated.map((x) => ({
      ...x,
      imageUrl: resolveStoreProductMediaUrl(x.imageUrl) ?? x.imageUrl,
    })),
    menuPreview: buildFeaturedMenuPreviewLine(hydrated) ?? base.menuPreview,
  };
}
