import { describe, expect, it } from "vitest";
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";
import { adjustStoreSettlementOnRefund } from "@/lib/stores/adjust-store-settlement-on-refund";

/**
 * PRODUCT LOCK — Delivery financial product paths (not aspirational).
 * HELPER ONLY states are forbidden for Discount / Point / Partial Refund.
 */
describe("STORE_ORDER_FINANCIAL_CONTRACT product lock", () => {
  it("locks coupon checkout authority and forbids Point / partial refund", () => {
    expect(STORE_ORDER_FINANCIAL_CONTRACT.storeCheckoutDiscountSupported).toBe(true);
    expect(STORE_ORDER_FINANCIAL_CONTRACT.discountAtCreateAlwaysZero).toBe(false);
    expect(STORE_ORDER_FINANCIAL_CONTRACT.customerCouponSupported).toBe(true);
    expect(STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported).toBe(false);
    expect(STORE_ORDER_FINANCIAL_CONTRACT.partialRefundSupported).toBe(false);
    expect(STORE_ORDER_FINANCIAL_CONTRACT.partialRefundProductPath).toBe(false);
  });

  it("period axes are distinct (sales ≠ settlement created_at alone)", () => {
    expect(STORE_ORDER_FINANCIAL_CONTRACT.salesPeriodField).toBe("order_completed_recognition");
    expect(STORE_ORDER_FINANCIAL_CONTRACT.settlementPeriodField).toBe("store_settlements.created_at");
    expect(STORE_ORDER_FINANCIAL_CONTRACT.payoutPeriodField).toBe("store_settlements.paid_at");
    expect(STORE_ORDER_FINANCIAL_CONTRACT.timezone).toBe("UTC");
  });
});

describe("partial refund product path unreachable", () => {
  it("adjust rejects 0 < refund < gross", async () => {
    const sb = {
      from: (table: string) => {
        if (table === "store_settlements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "set-1",
                    settlement_status: "scheduled",
                    gross_amount: 30000,
                    platform_fee_amount: 1800,
                    fixed_fee_amount: 0,
                    discount_burden_amount: 0,
                    delivery_income_amount: 0,
                    refund_amount: 0,
                    commission_reversal_amount: 0,
                    hold_reason: null,
                    payout_note: null,
                    paid_at: null,
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        if (table === "store_orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { store_funded_amount: 0 }, error: null }),
              }),
            }),
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
    const r = await adjustStoreSettlementOnRefund(sb as any, {
      orderId: "ord-partial",
      refundAmount: 10000,
    });
    expect(r).toEqual({ ok: false, error: "partial_refund_not_supported" });
  });
});
