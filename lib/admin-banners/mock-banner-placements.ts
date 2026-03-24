/**
 * 20단계: 배너 노출 위치 정의
 */

import type { BannerPlacementDef } from "@/lib/types/admin-banner";

export const BANNER_PLACEMENTS: BannerPlacementDef[] = [
  { key: "home_top", label: "홈 상단", description: "메인 홈 상단 배너", maxVisibleCount: 3 },
  { key: "home_middle", label: "홈 중단", description: "홈 피드 중간", maxVisibleCount: 2 },
  { key: "product_detail", label: "상품 상세", description: "상품 상세 페이지", maxVisibleCount: 1 },
  { key: "search_top", label: "검색 상단", description: "검색 결과 상단", maxVisibleCount: 2 },
  { key: "mypage_top", label: "마이페이지 상단", description: "마이페이지 상단", maxVisibleCount: 1 },
];

export function getBannerPlacements(): BannerPlacementDef[] {
  return [...BANNER_PLACEMENTS];
}

export function getBannerPlacementByKey(
  key: string
): BannerPlacementDef | undefined {
  return BANNER_PLACEMENTS.find((p) => p.key === key);
}
