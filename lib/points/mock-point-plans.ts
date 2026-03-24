/**
 * 23단계: 포인트 상품 mock
 */

import type { PointPlan } from "@/lib/types/point";

export const POINT_PLANS: PointPlan[] = [
  {
    id: "pp-1",
    name: "1,000P",
    paymentAmount: 1000,
    pointAmount: 1000,
    bonusPointAmount: 0,
    isActive: true,
    description: "₱1,000 결제 시 1,000P",
  },
  {
    id: "pp-2",
    name: "5,000P (+5% 보너스)",
    paymentAmount: 5000,
    pointAmount: 5000,
    bonusPointAmount: 250,
    isActive: true,
    description: "5,000원 결제 시 5,250P",
  },
  {
    id: "pp-3",
    name: "10,000P (+10% 보너스)",
    paymentAmount: 10000,
    pointAmount: 10000,
    bonusPointAmount: 1000,
    isActive: true,
    description: "₱10,000 결제 시 11,000P",
  },
];

export function getPointPlans(): PointPlan[] {
  return POINT_PLANS.filter((p) => p.isActive).map((p) => ({ ...p }));
}

export function getPointPlanById(id: string): PointPlan | undefined {
  return POINT_PLANS.find((p) => p.id === id);
}
