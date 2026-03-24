/**
 * 20단계: 배너 필터/정렬/옵션
 */

import type { AdminBanner, BannerStatus, BannerPlacement } from "@/lib/types/admin-banner";

export const BANNER_STATUS_OPTIONS: { value: BannerStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "active", label: "활성" },
  { value: "paused", label: "일시중지" },
  { value: "expired", label: "만료" },
  { value: "hidden", label: "숨김" },
];

export const BANNER_PLACEMENT_OPTIONS: { value: BannerPlacement | ""; label: string }[] = [
  { value: "", label: "전체 위치" },
  { value: "home_top", label: "홈 상단" },
  { value: "home_middle", label: "홈 중단" },
  { value: "product_detail", label: "상품 상세" },
  { value: "search_top", label: "검색 상단" },
  { value: "mypage_top", label: "마이페이지 상단" },
];

export interface AdminBannerFilters {
  status: BannerStatus | "";
  placement: BannerPlacement | "";
}

export function filterBanners(
  list: AdminBanner[],
  filters: AdminBannerFilters
): AdminBanner[] {
  let result = [...list];
  if (filters.status)
    result = result.filter((b) => b.status === filters.status);
  if (filters.placement)
    result = result.filter((b) => b.placement === filters.placement);
  return result.sort(
    (a, b) =>
      a.placement.localeCompare(b.placement) || a.priority - b.priority
  );
}
