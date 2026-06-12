import type { PointPromotionStatus } from "@/lib/types/exposure";
import type { PointPromotionOrder } from "@/lib/types/point";

export function resolvePointPromotionStatus(
  targetId: string,
  orders: PointPromotionOrder[]
): PointPromotionStatus {
  const related = orders.filter((o) => o.targetId === targetId && o.targetType === "product");
  if (related.length === 0) return "none";
  const now = new Date().toISOString();
  const active = related.find(
    (o) => o.orderStatus === "active" && o.startAt <= now && o.endAt >= now
  );
  if (active) return "active";
  const scheduled = related.find((o) => o.startAt > now);
  if (scheduled) return "scheduled";
  return "expired";
}

export function filterActiveProductPromotionOrders(
  orders: PointPromotionOrder[],
  nowIso = new Date().toISOString()
): PointPromotionOrder[] {
  return orders.filter(
    (o) =>
      o.targetType === "product" &&
      o.orderStatus === "active" &&
      o.startAt <= nowIso &&
      o.endAt >= nowIso
  );
}
