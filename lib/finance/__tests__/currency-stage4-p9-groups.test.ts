/**
 * 재감사 P-9 — DB 묶음(상태별 합)으로 만든 기간 합계 = 예전처럼 줄마다 더한 합계 (같은 함수 규칙).
 */
import { describe, expect, it } from "vitest";
import {
  ownerGiftRedemptionSummaryFromGroups,
  summarizeOwnerGiftRedemptionPeriod,
} from "@/lib/gift-certificate/owner-gift-money-ops";
import { promotionOrderSummaryFromGroups, summarizePromotionOrders } from "@/lib/points/promotion-order-history";

describe("P-9 묶음 합계 = 줄 합계", () => {
  it("사장님 상품권 정산 — 환불·확정·대기 칸과 금액", () => {
    const rows = [
      { reversed: false, recognized: true, redeemedAmount: 1000, platformFeeAmount: 100, merchantNetAmount: 900 },
      { reversed: false, recognized: true, redeemedAmount: 500, platformFeeAmount: 50, merchantNetAmount: 450 },
      { reversed: false, recognized: false, redeemedAmount: 800, platformFeeAmount: 80, merchantNetAmount: 720 },
      { reversed: true, recognized: false, redeemedAmount: 300, platformFeeAmount: 30, merchantNetAmount: 270 },
    ];
    const groups = [
      { reversed: false, recognized: true, count: 2, redeemed: 1500, fee: 150, net: 1350 },
      { reversed: false, recognized: false, count: 1, redeemed: 800, fee: 80, net: 720 },
      { reversed: true, recognized: false, count: 1, redeemed: 300, fee: 30, net: 270 },
    ];
    expect(ownerGiftRedemptionSummaryFromGroups(groups)).toEqual(summarizeOwnerGiftRedemptionPeriod(rows));
    expect(ownerGiftRedemptionSummaryFromGroups(null).counts.all).toBe(0);
  });

  it("상위노출 신청 — 상태 순서·건수·포인트·환불", () => {
    const rows = [
      { order_status: "ended", point_cost: 500, refund_points: 0 },
      { order_status: "ended", point_cost: 500, refund_points: 0 },
      { order_status: "rejected", point_cost: 1000, refund_points: 1000 },
      { order_status: "active", point_cost: 2000, refund_points: 0 },
    ];
    const groups = [
      { status: "rejected", count: 1, point_cost: 1000, refund_points: 1000 },
      { status: "active", count: 1, point_cost: 2000, refund_points: 0 },
      { status: "ended", count: 2, point_cost: 1000, refund_points: 0 },
    ];
    const fromGroups = promotionOrderSummaryFromGroups(groups);
    const fromRows = summarizePromotionOrders(rows);
    expect(fromGroups).toEqual({ ...fromRows, capped: false });
    expect(fromGroups.byStatus.map((s) => s.status)).toEqual(["active", "ended", "rejected"]);
  });
});
