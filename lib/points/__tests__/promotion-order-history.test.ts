import { describe, expect, it } from "vitest";
import {
  PROMOTION_ORDERS_MAX_LIMIT,
  PROMOTION_ORDERS_PAGE_SIZE,
  parsePromotionOrderPageParams,
  summarizePromotionOrders,
} from "@/lib/points/promotion-order-history";

const sp = (q: string) => new URLSearchParams(q);

describe("summarizePromotionOrders (C-5 기간 합계)", () => {
  it("신청 건수·포인트 합계·상태별·환불을 기간 전체 행으로 계산", () => {
    const s = summarizePromotionOrders([
      { order_status: "active", point_cost: 300, refund_points: 0 },
      { order_status: "ended", point_cost: "500", refund_points: null },
      { order_status: "rejected", point_cost: 300, refund_points: 300 },
      { order_status: "ACTIVE", point_cost: 200 },
      { order_status: "paused", point_cost: 100 },
    ]);
    expect(s.count).toBe(5);
    expect(s.pointCost).toBe(1400);
    expect(s.refundPoints).toBe(300);
    expect(s.byStatus).toEqual([
      { status: "active", count: 2, pointCost: 500 },
      { status: "paused", count: 1, pointCost: 100 },
      { status: "ended", count: 1, pointCost: 500 },
      { status: "rejected", count: 1, pointCost: 300 },
    ]);
    expect(s.capped).toBe(false);
  });

  it("빈 기간은 0 · 서버 건수가 읽은 행보다 많으면 capped", () => {
    expect(summarizePromotionOrders([])).toMatchObject({ count: 0, pointCost: 0, byStatus: [], capped: false });
    const c = summarizePromotionOrders([{ order_status: "ended", point_cost: 1 }], { rowCount: 9, cap: 1 });
    expect(c).toMatchObject({ capped: true, rowCount: 9, cap: 1 });
  });

  it("모르는 상태는 뒤에 그대로, 음수·비숫자 금액은 0", () => {
    const s = summarizePromotionOrders([
      { order_status: "weird", point_cost: -5 },
      { order_status: "pending", point_cost: "x" },
    ]);
    expect(s.byStatus.map((b) => b.status)).toEqual(["pending", "weird"]);
    expect(s.pointCost).toBe(0);
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
