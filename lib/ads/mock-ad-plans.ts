/**
 * 22단계: 광고 플랜 mock
 */

import type { AdPlan } from "@/lib/types/ad-application";

export const AD_PLANS: AdPlan[] = [
  {
    id: "ap-1",
    name: "홈 상단 7일",
    targetType: "product",
    placement: "home_top",
    durationDays: 7,
    price: 5000,
    isActive: true,
    description: "홈 상단 노출 7일",
  },
  {
    id: "ap-2",
    name: "홈 상단 14일",
    targetType: "product",
    placement: "home_top",
    durationDays: 14,
    price: 9000,
    isActive: true,
    description: "홈 상단 노출 14일",
  },
  {
    id: "ap-3",
    name: "홈 중단 7일",
    targetType: "product",
    placement: "home_middle",
    durationDays: 7,
    price: 3000,
    isActive: true,
    description: "홈 중단 노출 7일",
  },
  {
    id: "ap-4",
    name: "검색 상단 7일",
    targetType: "product",
    placement: "search_top",
    durationDays: 7,
    price: 4000,
    isActive: true,
    description: "검색 결과 상단 7일",
  },
  {
    id: "ap-5",
    name: "상점 추천 7일",
    targetType: "shop",
    placement: "shop_featured",
    durationDays: 7,
    price: 10000,
    isActive: true,
    description: "상점 추천 영역 7일",
  },
];

export function getAdPlans(): AdPlan[] {
  return AD_PLANS.filter((p) => p.isActive).map((p) => ({ ...p }));
}

export function getAdPlansByTargetAndPlacement(
  targetType: string,
  placement: string
): AdPlan[] {
  return AD_PLANS.filter(
    (p) => p.isActive && p.targetType === targetType && p.placement === placement
  ).map((p) => ({ ...p }));
}

export function getAdPlanById(id: string): AdPlan | undefined {
  return AD_PLANS.find((p) => p.id === id);
}
