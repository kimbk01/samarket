import { describe, expect, it } from "vitest";
import {
  confirmedSaleRevenuePhp,
  saleCoinIdempotencyKeyForOrder,
  CONFIRMED_SALE_REVENUE_CONTRACT,
} from "@/lib/stores/confirmed-sale-revenue";

describe("confirmedSaleRevenuePhp", () => {
  it("cash-only store coupon: 900 not 1000", () => {
    expect(
      confirmedSaleRevenuePhp({
        payment_amount: 900,
        discount_amount: 100,
        store_funded_amount: 100,
        platform_funded_amount: 0,
        gift_redemption_amount: 0,
      })
    ).toBe(900);
  });

  it("platform coupon: customer pays 900, platform 100 → 1000", () => {
    expect(
      confirmedSaleRevenuePhp({
        payment_amount: 900,
        platform_funded_amount: 100,
        gift_redemption_amount: 0,
      })
    ).toBe(1000);
  });

  it("gift-only order", () => {
    expect(
      confirmedSaleRevenuePhp({
        payment_amount: 0,
        gift_redemption_amount: 900,
        platform_funded_amount: 0,
      })
    ).toBe(900);
  });

  it("gift + cash mixed", () => {
    expect(
      confirmedSaleRevenuePhp({
        payment_amount: 200,
        gift_redemption_amount: 700,
        platform_funded_amount: 0,
      })
    ).toBe(900);
  });

  it("gift + store coupon — no double count", () => {
    expect(
      confirmedSaleRevenuePhp({
        payment_amount: 800,
        gift_redemption_amount: 100,
        discount_amount: 100,
        store_funded_amount: 100,
        platform_funded_amount: 0,
      })
    ).toBe(900);
  });

  it("refunded order → 0", () => {
    expect(
      confirmedSaleRevenuePhp({
        order_status: "refunded",
        payment_amount: 900,
        gift_redemption_amount: 0,
      })
    ).toBe(0);
  });

  it("sale_coin idempotency is order-scoped", () => {
    const oid = "7b64cd15-009c-42f0-aa9f-23839d4b3c33";
    expect(saleCoinIdempotencyKeyForOrder(oid)).toBe(`sale_coin:${oid}`);
  });

  it("contract forbids gift_coin second mint", () => {
    expect(CONFIRMED_SALE_REVENUE_CONTRACT.forbiddenSecondMint).toBe("gift_coin:{redemptionId}");
    expect(CONFIRMED_SALE_REVENUE_CONTRACT.coinMintIdentity).toBe("sale_coin:{orderId}");
  });
});
