import { describe, expect, it } from "vitest";
import { pickBestEligibleCouponQuote } from "@/lib/stores/store-coupon-best-eligible";

describe("store-coupon-best-eligible", () => {
  it("picks higher server discount, not client order", () => {
    const best = pickBestEligibleCouponQuote([
      { userCouponId: "b", campaignId: "1", title: "B", discountAmount: 50, ineligibleReason: null },
      { userCouponId: "a", campaignId: "2", title: "A", discountAmount: 90, ineligibleReason: null },
      { userCouponId: "c", campaignId: "3", title: "C", discountAmount: 0, ineligibleReason: "coupon_min_order" },
    ]);
    expect(best?.userCouponId).toBe("a");
    expect(best?.discountAmount).toBe(90);
  });
});
