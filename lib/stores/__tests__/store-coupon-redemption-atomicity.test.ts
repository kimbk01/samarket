import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ROUTE = "app/api/me/store-orders/route.ts";
const MIG_COUPON =
  "supabase/migrations/20261024170000_create_store_order_atomic_coupon_redemption.sql";
const RESOLVER = "lib/stores/resolve-store-coupon-checkout-discount.ts";

describe("Stores A coupon redemption atomicity contract", () => {
  it("route folds coupon into createStoreOrderAtomic payload and never soft-logs redemption", () => {
    const src = readFileSync(ROUTE, "utf8");
    expect(src).toContain("createStoreOrderAtomic");
    expect(src).toContain("coupon_campaign_id");
    expect(src).not.toContain("recordStoreCouponRedemption");
    expect(src).not.toContain("[POST /api/me/store-orders] coupon redemption");
  });

  it("RPC migration inserts redemption in same TX and rolls back on duplicate", () => {
    const mig = readFileSync(MIG_COUPON, "utf8");
    expect(mig).toContain("CREATE OR REPLACE FUNCTION public.create_store_order_atomic");
    expect(mig).toContain("INSERT INTO public.store_coupon_redemptions");
    expect(mig).toContain("coupon_campaign_id");
    expect(mig).toContain("coupon_already_redeemed");
    expect(mig).toContain("coupon_inactive");
    expect(mig).toContain("coupon_expired");
    expect(mig).toContain("coupon_not_found");
    expect(mig).toContain("FOR UPDATE");
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
