import { describe, expect, it } from "vitest";
import {
  PROMOTION_ORDERS_MAX_LIMIT,
  PROMOTION_ORDERS_PAGE_SIZE,
  parsePromotionOrderPageParams,
  promotionOrderSummaryFromGroups,
} from "@/lib/points/promotion-order-history";

const sp = (q: string) => new URLSearchParams(q);

describe("C-5 기간 합계 = DB 상태별 묶음 (P-9 · member_promotion_order_period_sums)", () => {
  it("신청 건수·포인트·환불 합 · 상태 표시 순서 · 0건 상태는 뺀다", () => {
    const s = promotionOrderSummaryFromGroups([
      { status: "rejected", count: 1, point_cost: 300, refund_points: 300 },
      { status: "ended", count: 1, point_cost: "500", refund_points: 0 },
      { status: "active", count: 2, point_cost: 500, refund_points: 0 },
      { status: "paused", count: 1, point_cost: 100, refund_points: 0 },
      { status: "weird", count: 0, point_cost: 0, refund_points: 0 },
    ]);
    expect(s).toEqual({
      count: 5,
      pointCost: 1400,
      refundPoints: 300,
      byStatus: [
        { status: "active", count: 2, pointCost: 500 },
        { status: "paused", count: 1, pointCost: 100 },
        { status: "ended", count: 1, pointCost: 500 },
        { status: "rejected", count: 1, pointCost: 300 },
      ],
    });
  });
  it("빈 결과는 0", () => {
    expect(promotionOrderSummaryFromGroups([])).toEqual({ count: 0, pointCost: 0, refundPoints: 0, byStatus: [] });
    expect(promotionOrderSummaryFromGroups(null).count).toBe(0);
  });
});

describe("parsePromotionOrderPageParams", () => {
  it("offset 이 없으면 예전 응답 모드(null)", () => {
    expect(parsePromotionOrderPageParams(sp("targetId=x"))).toBeNull();
    expect(parsePromotionOrderPageParams(sp("offset="))).toBeNull();
  });
  it("offset·limit 정리 — 기본 20, 최대 100, 음수 0", () => {
    expect(parsePromotionOrderPageParams(sp("offset=40"))).toEqual({ offset: 40, limit: PROMOTION_ORDERS_PAGE_SIZE });
    expect(parsePromotionOrderPageParams(sp("offset=-3&limit=999"))).toEqual({ offset: 0, limit: PROMOTION_ORDERS_MAX_LIMIT });
    expect(parsePromotionOrderPageParams(sp("offset=0&limit=0"))).toEqual({ offset: 0, limit: PROMOTION_ORDERS_PAGE_SIZE });
  });
});
