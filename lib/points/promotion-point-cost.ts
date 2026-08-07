import type { PointPromotionPlacement } from "@/lib/types/point";
import { getMemberPromotionProduct } from "@/lib/points/promotion-products";

/**
 * @deprecated Prefer `getMemberPromotionProduct(productId).pointCost`.
 * Kept for legacy callers — maps placement×days onto new product prices.
 */
export function getPointCostForPromotion(
  placement: PointPromotionPlacement,
  durationDays: number
): number {
  const days = Math.max(1, Math.floor(Number(durationDays) || 7));
  const product =
    getMemberPromotionProduct(days >= 14 ? "trade_promote_14" : "trade_promote_7") ??
    getMemberPromotionProduct("trade_promote_7");
  if (product) return product.pointCost;
  void placement;
  return days * 50;
}
