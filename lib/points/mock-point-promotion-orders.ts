/**
 * 23단계: 포인트 프로모션 주문 mock (포인트로 노출상품 구매)
 */

import type {
  PointPromotionOrder,
  PointPromotionOrderStatus,
  PointPromotionPlacement,
  PointPromotionTargetType,
} from "@/lib/types/point";
import { getUserPointBalance } from "@/lib/admin-users/mock-admin-users";
import { appendPointLedger } from "./mock-point-ledger";
import { addPointActionLog } from "./mock-point-action-logs";

const ORDERS: PointPromotionOrder[] = [];

/** placement + durationDays -> pointCost (mock) */
const POINT_COST: Record<string, number> = {
  "home_top_7": 500,
  "home_top_14": 900,
  "home_middle_7": 300,
  "search_top_7": 400,
  "shop_featured_7": 600,
};

function nextId(): string {
  const nums = ORDERS.map((o) =>
    parseInt(o.id.replace("ppo-", ""), 10)
  ).filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `ppo-${max + 1}`;
}

export function getPointCostForPromotion(
  placement: PointPromotionPlacement,
  durationDays: number
): number {
  return POINT_COST[`${placement}_${durationDays}`] ?? durationDays * 50;
}

export function getPointPromotionOrdersByUser(
  userId: string
): PointPromotionOrder[] {
  return ORDERS.filter((o) => o.userId === userId)
    .map((o) => ({ ...o }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

/** 28단계: 노출 점수용 전체 주문 목록 */
export function getPointPromotionOrders(): PointPromotionOrder[] {
  return ORDERS.map((o) => ({ ...o }));
}

export function createPointPromotionOrder(input: {
  userId: string;
  userNickname: string;
  targetType: PointPromotionTargetType;
  targetId: string;
  targetTitle: string;
  placement: PointPromotionPlacement;
  durationDays: number;
}): { ok: true; order: PointPromotionOrder } | { ok: false; reason: string } {
  const cost = getPointCostForPromotion(
    input.placement,
    input.durationDays
  );
  const balance = getUserPointBalance(input.userId);
  if (balance < cost) {
    return { ok: false, reason: "포인트가 부족합니다." };
  }
  const now = new Date().toISOString();
  const startAt = now;
  const endAt = new Date(
    Date.now() + input.durationDays * 86400000
  ).toISOString();
  const order: PointPromotionOrder = {
    id: nextId(),
    userId: input.userId,
    userNickname: input.userNickname,
    targetType: input.targetType,
    targetId: input.targetId,
    targetTitle: input.targetTitle,
    placement: input.placement,
    durationDays: input.durationDays,
    pointCost: cost,
    orderStatus: "active",
    startAt,
    endAt,
    createdAt: now,
  };
  ORDERS.push(order);
  appendPointLedger(
    input.userId,
    input.userNickname,
    "spend",
    cost,
    "promoted_item",
    order.id,
    `포인트 노출: ${input.targetTitle}`,
    "user"
  );
  addPointActionLog(
    "spend_points",
    "user",
    input.userId,
    input.userNickname,
    input.userId,
    input.userNickname,
    order.id,
    `포인트 사용 ${cost}P`
  );
  return { ok: true, order: { ...order } };
}
