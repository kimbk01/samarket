/**
 * 20단계: 배너 필터/정렬/옵션
 */

import type { AdminBanner, BannerStatus } from "@/lib/types/admin-banner";

export const BANNER_STATUS_OPTIONS: { value: BannerStatus | ""; label: string }[] = [
  { value: "", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "active", label: "활성" },
  { value: "paused", label: "일시중지" },
  { value: "expired", label: "만료" },
  { value: "hidden", label: "숨김" },
];

/* 광고 감사 B-6: 쓰는 곳 없던 레거시 위치 목록(home_top·home_middle·product_detail·search_top) 제거 —
 * 마이페이지 CMS 배너는 저장 시 `mypage_top` 고정(`admin-banners-db.ts`). */

export interface AdminBannerFilters {
  status: BannerStatus | "";
}

export function filterBanners(
  list: AdminBanner[],
  filters: AdminBannerFilters
): AdminBanner[] {
  let result = [...list];
  if (filters.status)
    result = result.filter((b) => b.status === filters.status);
  return result.sort((a, b) => a.priority - b.priority);
}
