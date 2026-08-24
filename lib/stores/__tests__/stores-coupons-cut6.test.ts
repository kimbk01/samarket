import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STORE_COUPON_CAMPAIGN_TABLE,
  type StoreCouponCampaignRow,
} from "@/lib/stores/store-coupon-campaign-authority";
import {
  computeStoreCouponDiscountPhp,
  resolveCouponBadgeAllowed,
  resolveStoreCouponEligibility,
  selectDiscoveryEligibleStoreCoupons,
} from "@/lib/stores/store-coupon-eligibility";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import { STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS } from "@/lib/stores/discovery-authority/monetization";
import { homeCouponInsertions } from "@/lib/stores/composition/stores-composition-insertion-live";
import { STORES_HOME_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-home-composition-default-policy";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import { planStoresBrowseInsertions } from "@/lib/stores/composition/stores-composition-insertion-live";

const nowMs = Date.parse("2026-06-15T12:00:00.000Z");

const baseCoupon = (
  overrides: Partial<StoreCouponCampaignRow> & Pick<StoreCouponCampaignRow, "id" | "storeId">
): StoreCouponCampaignRow => ({
  id: overrides.id,
  storeId: overrides.storeId,
  title: overrides.title ?? `c-${overrides.id}`,
  discountType: overrides.discountType ?? "percent",
  discountValue: overrides.discountValue ?? 10,
  minOrderAmount: overrides.minOrderAmount ?? null,
  termsCopy: overrides.termsCopy ?? null,
  startAt: overrides.startAt ?? "2026-06-01T00:00:00.000Z",
  endAt: overrides.endAt ?? "2026-07-01T00:00:00.000Z",
  isActive: overrides.isActive ?? true,
});

describe("CUT 6 store coupons SSOT", () => {
  it("T1 canonical coupon entity one authority", () => {
    expect(STORE_COUPON_CAMPAIGN_TABLE).toBe("store_coupon_campaigns");
    expect(STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS.COUPON).toBe(STORE_COUPON_CAMPAIGN_TABLE);
    const checkout = readFileSync(
      join(process.cwd(), "lib/stores/resolve-store-coupon-checkout-discount.ts"),
      "utf8"
    );
    expect(checkout).toMatch(/resolveStoreCouponEligibility/);
    expect(checkout).toMatch(/store_coupon_campaigns/);
  });

  it("T2 active/window eligibility", () => {
    const state = resolveStoreCouponEligibility({
      campaign: baseCoupon({ id: "c1", storeId: "s1" }),
      nowMs,
    });
    expect(state.eligible).toBe(true);
    expect(state.blockingReasons).toEqual([]);
  });

  it("T3 inactive blocked", () => {
    const state = resolveStoreCouponEligibility({
      campaign: baseCoupon({ id: "c1", storeId: "s1", isActive: false }),
      nowMs,
    });
    expect(state.eligible).toBe(false);
    expect(state.blockingReasons).toContain("campaignActive");
  });

  it("T4 expired/future blocked", () => {
    const expired = resolveStoreCouponEligibility({
      campaign: baseCoupon({
        id: "c1",
        storeId: "s1",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-02-01T00:00:00.000Z",
      }),
      nowMs,
    });
    expect(expired.blockingReasons).toContain("windowActive");
    const future = resolveStoreCouponEligibility({
      campaign: baseCoupon({
        id: "c2",
        storeId: "s1",
        startAt: "2026-08-01T00:00:00.000Z",
        endAt: "2026-09-01T00:00:00.000Z",
      }),
      nowMs,
    });
    expect(future.blockingReasons).toContain("windowActive");
  });

  it("T5 store mismatch blocked", () => {
    const state = resolveStoreCouponEligibility({
      campaign: baseCoupon({ id: "c1", storeId: "s1" }),
      nowMs,
      expectedStoreId: "s2",
    });
    expect(state.eligible).toBe(false);
    expect(state.blockingReasons).toContain("storeMatched");
  });

  it("T6 minimum-order rule if supported", () => {
    const campaign = baseCoupon({ id: "c1", storeId: "s1", minOrderAmount: 500 });
    const fail = resolveStoreCouponEligibility({
      campaign,
      nowMs,
      expectedStoreId: "s1",
      itemGrossPhp: 100,
    });
    expect(fail.blockingReasons).toContain("minOrderMet");
    const ok = resolveStoreCouponEligibility({
      campaign,
      nowMs,
      expectedStoreId: "s1",
      itemGrossPhp: 500,
    });
    expect(ok.eligible).toBe(true);
  });

  it("T7 maximum-discount rule if supported", () => {
    /** Schema has no max_discount column — percent/fixed capped by item gross only. */
    expect(computeStoreCouponDiscountPhp(baseCoupon({ id: "c1", storeId: "s1", discountType: "percent", discountValue: 50 }), 200)).toBe(100);
    expect(computeStoreCouponDiscountPhp(baseCoupon({ id: "c1", storeId: "s1", discountType: "fixed_amount", discountValue: 999 }), 50)).toBe(50);
  });

  it("T8 surface badge allowed ≠ eligibility", () => {
    const eligible = resolveStoreCouponEligibility({
      campaign: baseCoupon({ id: "c1", storeId: "s1" }),
      nowMs,
    });
    expect(eligible.eligible).toBe(true);
    expect(resolveCouponBadgeAllowed({ couponIntegration: "off" })).toBe(false);
    expect(resolveCouponBadgeAllowed({ couponIntegration: "badge_on_image" })).toBe(true);
    expect(resolveCouponBadgeAllowed({ browseCouponEnabled: false })).toBe(false);
    expect(resolveCouponBadgeAllowed({ browseCouponEnabled: true })).toBe(true);
  });

  it("T9 HOME badge consumes canonical coupon (meta not gated by homeCouponInsertion.enabled)", () => {
    const campaigns = [baseCoupon({ id: "c1", storeId: "s1" })];
    const eligible = selectDiscoveryEligibleStoreCoupons({ campaigns, nowMs });
    const policy = STORES_HOME_COMPOSITION_DEFAULT_POLICY.map((r) =>
      r.slot === "homeCouponInsertion" ? { ...r, enabled: false, max: 5 } : r
    );
    const capped = homeCouponInsertions(eligible, policy);
    expect(capped).toHaveLength(1);
    expect(capped[0]?.id).toBe("c1");
  });

  it("T10 BROWSE coupon uses discovery eligibility; organic ids preserved", () => {
    const organic = ["s1", "s2", "s3", "s4"];
    const policy = STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
      r.slot === "future_coupon_insertion"
        ? { ...r, enabled: true, max: 2, interval: { consumed: true as const, everyN: 2 } }
        : r
    );
    const coupons = selectDiscoveryEligibleStoreCoupons({
      campaigns: [
        baseCoupon({ id: "ok", storeId: "s2" }),
        baseCoupon({ id: "out", storeId: "other", isActive: false }),
      ],
      nowMs,
      storeIds: new Set(organic),
    });
    expect(coupons.map((c) => c.id)).toEqual(["ok"]);
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [],
      coupons,
      policy,
    });
    expect(plan.organicIds).toEqual(organic);
  });

  it("T11 coupon does not change organic ranking", () => {
    const organic = ["a", "b", "c", "d"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [],
      coupons: [baseCoupon({ id: "c1", storeId: "b" })],
      policy: STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
        r.slot === "future_coupon_insertion"
          ? { ...r, enabled: true, max: 1, interval: { consumed: true as const, everyN: 2 } }
          : r
      ),
    });
    expect(plan.organicIds).toEqual(organic);
  });

  it("T12 Detail consumes same entity if applicable", () => {
    const detail = readFileSync(
      join(process.cwd(), "components/stores/store-detail/StoreDetailSummarySection.tsx"),
      "utf8"
    );
    expect(detail).toMatch(/showCouponBadge=\{false\}/);
    /** Detail UI badge off — entity remains store_coupon_campaigns via checkout path. */
  });

  it("T13 Checkout revalidates server-side", () => {
    const orders = readFileSync(join(process.cwd(), "app/api/me/store-orders/route.ts"), "utf8");
    expect(orders).toMatch(/resolveStoreCouponCheckoutDiscount/);
    const session = readFileSync(
      join(process.cwd(), "lib/stores/store-checkout-coupon-session.ts"),
      "utf8"
    );
    expect(session).toMatch(/sessionStorage/);
    expect(orders).not.toMatch(/readStoreCheckoutCouponSession/);
  });

  it("T14 discount server-authoritative", () => {
    expect(computeStoreCouponDiscountPhp(baseCoupon({ id: "c1", storeId: "s1", discountType: "percent", discountValue: 10 }), 1000)).toBe(100);
    const checkout = readFileSync(
      join(process.cwd(), "lib/stores/resolve-store-coupon-checkout-discount.ts"),
      "utf8"
    );
    expect(checkout).toMatch(/computeStoreCouponDiscountPhp/);
  });

  it("T15 order snapshot preserved if existing", () => {
    const mig = readFileSync(
      join(process.cwd(), "supabase/migrations/20260824160000_store_coupon_redemptions.sql"),
      "utf8"
    );
    expect(mig).toMatch(/coupon_campaign_id/);
    expect(mig).toMatch(/discount_amount_applied/);
  });

  it("T16 duplicate redemption protection if existing", () => {
    const state = resolveStoreCouponEligibility({
      campaign: baseCoupon({ id: "c1", storeId: "s1" }),
      nowMs,
      expectedStoreId: "s1",
      itemGrossPhp: 1000,
      alreadyRedeemed: true,
    });
    expect(state.blockingReasons).toContain("notAlreadyRedeemed");
    const mig = readFileSync(
      join(process.cwd(), "supabase/migrations/20260824160000_store_coupon_redemptions.sql"),
      "utf8"
    );
    expect(mig).toMatch(/UNIQUE \(buyer_user_id, campaign_id\)/);
  });

  it("T17 Paid Ads untouched", () => {
    expect(STORE_PAID_AD_CAMPAIGN_TABLE).not.toBe(STORE_COUPON_CAMPAIGN_TABLE);
    const eligibility = readFileSync(
      join(process.cwd(), "lib/stores/store-coupon-eligibility.ts"),
      "utf8"
    );
    expect(eligibility).not.toMatch(/store_paid_ad|paid-ad-exposure/);
  });

  it("T18 Banner untouched", () => {
    expect(STORE_BANNER_AD_CAMPAIGN_TABLE).not.toBe(STORE_COUPON_CAMPAIGN_TABLE);
    const eligibility = readFileSync(
      join(process.cwd(), "lib/stores/store-coupon-eligibility.ts"),
      "utf8"
    );
    expect(eligibility).not.toMatch(/store_banner_ad|home-hero-banners/);
  });

  it("T19 Editorial Promotion untouched", () => {
    expect(STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS.EDITORIAL_PROMOTION).toBe(
      "store_discovery_campaigns"
    );
  });

  it("T20 CUT 3 representative products untouched", () => {
    const browseOrganic = readFileSync(
      join(process.cwd(), "lib/stores/browse-organic-contract.ts"),
      "utf8"
    );
    expect(browseOrganic).toMatch(/BROWSE_ORGANIC_REPRESENTATIVE_PRODUCTS_MAX = 4/);
  });
});
