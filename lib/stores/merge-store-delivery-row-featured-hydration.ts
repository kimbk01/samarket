import { resolveStoreProductMediaUrl } from "@/lib/media/resolve-store-product-media-url";
import { buildFeaturedMenuPreviewLine } from "@/lib/stores/browse-featured-items-types";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { StoreRowCardData } from "@/components/stores/home/StoreDeliveryRowCard";

/**
 * CONTRACT — 배달 목록(`StoreDeliveryRowCard`) 메뉴 썸네일
 *
 * - `browse`·`home-feed` 1차 응답에는 featured 메뉴 **이름·가격만** (썸네일 URL 금지).
 * - 썸네일은 뷰포트 진입 시 `GET /api/stores/browse-featured-items` 배치 1회로만 채운다.
 * - UI는 `useBrowseFeaturedItemsHydration` + 본 병합 함수를 **browse·홈 피드 모두**에 적용한다.
 * - `homeFeedToRowCard` / browse cold row의 `imageUrl: null` 은 의도적 placeholder — hydration 전용.
 *
 * DO NOT: home-feed·browse cold path에 `thumbnail_url` 조인/일괄 fetch 추가(목록 p95 회귀).
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
