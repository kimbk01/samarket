import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE = "app/api/me/store-orders/route.ts";
const MIG_COUPON =
  "supabase/migrations/20261124120000_free_coupon_entitlement_checkout_canonical.sql";
const RESOLVER = "lib/stores/resolve-store-coupon-checkout-discount.ts";

describe("Stores A coupon redemption atomicity contract", () => {
  it("route folds coupon into createStoreOrderAtomic payload and never soft-logs redemption", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).toContain("createStoreOrderAtomic");
    expect(src).toContain("coupon_campaign_id");
    expect(src).toContain("coupon_entitlement_required");
    expect(src).toContain("user_coupon_id: userCouponId");
    expect(src).not.toContain("recordStoreCouponRedemption");
    expect(src).not.toContain("[POST /api/me/store-orders] coupon redemption");
  });

  it("canonical RPC migration requires entitlement and keeps redemption in same TX", () => {
    const mig = readFileSync(MIG_COUPON, "utf8");
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.create_store_order_atomic");
    expect(mig).toContain("INSERT INTO public.store_coupon_redemptions");
    expect(mig).toContain("user_coupon_id");
    expect(mig).toContain("coupon_entitlement_required");
    expect(mig).toContain("coupon_user_entitlements");
    expect(mig).toContain("status = 'redeemed'");
    expect(mig).toContain("FOR UPDATE");
    expect(mig).not.toMatch(/IF v_user_coupon_id IS NULL AND EXISTS/);
    expect(mig).toMatch(/WHEN unique_violation THEN[\s\S]*coupon_already_redeemed/);
  });

  it("app resolver still rejects invalid/expired/inactive/duplicate before RPC", () => {
    const src = readFileSync(RESOLVER, "utf8");
    expect(src).toContain("coupon_inactive");
    expect(src).toContain("coupon_expired");
    expect(src).toContain("coupon_already_redeemed");
    expect(src).toContain("coupon_not_found");
    expect(src).toContain('"percent"');
    expect(src).toContain('"fixed_amount"');
  });
});
