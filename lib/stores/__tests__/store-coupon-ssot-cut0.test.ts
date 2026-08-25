import { describe, expect, it } from "vitest";
import {
  PAID_VOUCHER_IMPLEMENTATION_BLOCKED,
  couponLifecycleAllowsNewClaim,
  couponLifecycleAllowsRedeemHeld,
  isPaidCouponTypeForbidden,
  isStoreCouponFundingMode,
} from "@/lib/stores/store-coupon-ssot";
import { grantStoreCouponFromEditorialEvent } from "@/lib/stores/store-coupon-event-grant";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import { STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS } from "@/lib/stores/discovery-authority/monetization";

describe("FREE COUPON CUT 0 domain lock", () => {
  it("keeps campaign table name and forbids paid type merge", () => {
    expect(STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS.COUPON).toBe("store_coupon_campaigns");
    expect(isPaidCouponTypeForbidden("paid")).toBe(true);
    expect(isPaidCouponTypeForbidden("fixed_amount")).toBe(false);
    expect(PAID_VOUCHER_IMPLEMENTATION_BLOCKED).toBe(true);
  });

  it("locks funding modes and pause vs revoke claim rules", () => {
    expect(isStoreCouponFundingMode("STORE_FUNDED")).toBe(true);
    expect(couponLifecycleAllowsNewClaim("active")).toBe(true);
    expect(couponLifecycleAllowsNewClaim("paused")).toBe(false);
    expect(couponLifecycleAllowsRedeemHeld("paused")).toBe(true);
    expect(couponLifecycleAllowsRedeemHeld("revoked")).toBe(false);
  });

  it("CUT 3–5 routes and CUT 10 grant wrapper exist", () => {
    expect(OwnerRoutes.coupons("s1")).toBe("/stores/owner/coupons?storeId=s1");
    expect(typeof grantStoreCouponFromEditorialEvent).toBe("function");
  });
});
