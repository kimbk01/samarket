import type { HomeFeedRegionScope, HomeFeedSectionKey, HomeFeedSortMode } from "@/lib/types/home-feed";

export const SECTION_LABELS: Record<HomeFeedSectionKey, string> = {
  recommended: "추천 상품",
  local_latest: "우리동네 최신",
  bumped: "끌올 상품",
  sponsored: "광고/프로모션",
  premium_shops: "특별회원/상점 추천",
  recent_based: "최근 본 상품 기반 추천",
};

export const SORT_MODE_LABELS: Record<HomeFeedSortMode, string> = {
  featured: "추천순",
  latest: "최신순",
  nearby: "가까운순",
  popular: "인기순",
  mixed: "혼합",
};

export const REGION_SCOPE_LABELS: Record<HomeFeedRegionScope, string> = {
  barangay: "바랑가이",
  city: "시/도시",
  region: "지역",
};
