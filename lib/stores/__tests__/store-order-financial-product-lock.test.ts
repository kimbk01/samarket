import { describe, expect, it } from "vitest";
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";
import { confirmedSaleRevenuePhp } from "@/lib/stores/confirmed-sale-revenue";
import { adjustStoreSettlementOnRefund } from "@/lib/stores/adjust-store-settlement-on-refund";
import { computeCheckoutLayersBeforeAndAfterGift } from "@/lib/gift-certificate/gift-certificate-domain-contract";

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

  it("locks payment_amount as customer remaining payment after gift", () => {
    expect(STORE_ORDER_FINANCIAL_CONTRACT.paymentAmountMeaning).toBe(
      "customer_remaining_payment_after_gift"
    );
    expect(STORE_ORDER_FINANCIAL_CONTRACT.amountBeforeGiftMeaning).toBe(
      "customer_due_after_coupon_before_gift"
    );
    expect(STORE_ORDER_FINANCIAL_CONTRACT.giftRedemptionAmountMeaning).toBe(
      "gift_certificate_payment_amount"
    );
    expect(STORE_ORDER_FINANCIAL_CONTRACT.merchantRevenueFormula).toBe(
      "payment_amount + gift_redemption_amount + platform_funded_amount - refund_attributed_reversal"
    );
  });

  it("locks money CASE A-F: minimum basis is item subtotal, gift is payment", () => {
    const minimum = 1000;
    const cases = [
      { name: "A", items: 2000, coupon: 0, gift: 1100, minPass: true, remaining: 900, merchant: 2000 },
      { name: "B", items: 900, coupon: 0, gift: 900, minPass: false, remaining: 0, merchant: 900 },
      { name: "C", items: 1500, coupon: 0, gift: 2000, minPass: true, remaining: 0, merchant: 1500 },
      { name: "D", items: 2000, coupon: 0, gift: 2000, minPass: true, remaining: 0, merchant: 2000 },
      { name: "E", items: 2000, coupon: 300, gift: 0, minPass: true, remaining: 1700, merchant: 1700 },
      { name: "F", items: 2000, coupon: 300, gift: 1100, minPass: true, remaining: 600, merchant: 1700 },
    ];

    for (const c of cases) {
      const layers = computeCheckoutLayersBeforeAndAfterGift({
        itemGross: c.items,
        deliveryFee: 0,
        couponDiscount: c.coupon,
        giftRedeemAmount: c.gift,
      });
      expect(c.items >= minimum, c.name).toBe(c.minPass);
      expect(layers.remainingPayment, c.name).toBe(c.remaining);
      expect(
        confirmedSaleRevenuePhp({
          payment_amount: layers.remainingPayment,
          gift_redemption_amount: layers.giftRedemption,
          platform_funded_amount: 0,
          order_status: "completed",
        }),
        c.name
      ).toBe(c.merchant);
    }
    expect(cases[0]!.items >= minimum).toBe(true);
    expect(cases[0]!.remaining >= minimum).toBe(false);
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
