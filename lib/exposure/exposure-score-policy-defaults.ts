import type { ExposureScorePolicy, ExposureSurface } from "@/lib/types/exposure";

/** DB 미적용·오프라인 시 동기 폴백 (구 mock 시드와 동일) */
export const EXPOSURE_SCORE_POLICY_DEFAULTS: ExposureScorePolicy[] = [
  {
    id: "a1000001-0000-4000-8000-000000000001",
    surface: "home",
    isActive: true,
    policyName: "홈 상단 정책",
    latestWeight: 1,
    popularWeight: 0.8,
    nearbyWeight: 0.6,
    premiumBoostWeight: 10,
    businessBoostWeight: 5,
    adBoostWeight: 20,
    pointPromotionBoostWeight: 15,
    bumpBoostWeight: 8,
    exactRegionMatchWeight: 12,
    sameCityWeight: 6,
    sameBarangayWeight: 10,
    createdAt: "",
    updatedAt: "",
    adminMemo: "홈 피드 노출",
  },
  {
    id: "a1000002-0000-4000-8000-000000000002",
    surface: "search",
    isActive: true,
    policyName: "검색 결과 정책",
    latestWeight: 1,
    popularWeight: 0.9,
    nearbyWeight: 0.5,
    premiumBoostWeight: 8,
    businessBoostWeight: 4,
    adBoostWeight: 18,
    pointPromotionBoostWeight: 12,
    bumpBoostWeight: 6,
    exactRegionMatchWeight: 10,
    sameCityWeight: 5,
    sameBarangayWeight: 8,
    createdAt: "",
    updatedAt: "",
    adminMemo: "검색 상단 노출",
  },
  {
    id: "a1000003-0000-4000-8000-000000000003",
    surface: "shop_featured",
    isActive: true,
    policyName: "상점 featured 정책",
    latestWeight: 0.8,
    popularWeight: 0.7,
    nearbyWeight: 0.3,
    premiumBoostWeight: 5,
    businessBoostWeight: 15,
    adBoostWeight: 10,
    pointPromotionBoostWeight: 10,
    bumpBoostWeight: 5,
    exactRegionMatchWeight: 6,
    sameCityWeight: 3,
    sameBarangayWeight: 5,
    createdAt: "",
    updatedAt: "",
    adminMemo: "상점 추천 영역",
  },
];

export function getDefaultExposureScorePolicyBySurface(
  surface: ExposureSurface
): ExposureScorePolicy | undefined {
  return EXPOSURE_SCORE_POLICY_DEFAULTS.find((p) => p.surface === surface && p.isActive);
}
