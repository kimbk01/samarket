import type { PointPromotionPlacement } from "@/lib/types/point";

/** placement + durationDays → pointCost (프로모션 주문 API와 동일 산식) */
const POINT_COST: Record<string, number> = {
  home_top_7: 500,
  home_top_14: 900,
  home_middle_7: 300,
  search_top_7: 400,
  shop_featured_7: 600,
};

export function getPointCostForPromotion(
  placement: PointPromotionPlacement,
  durationDays: number
): number {
  return POINT_COST[`${placement}_${durationDays}`] ?? durationDays * 50;
}
