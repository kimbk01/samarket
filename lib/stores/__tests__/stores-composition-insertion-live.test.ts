import { describe, expect, it } from "vitest";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import { planStoresBrowseInsertions } from "@/lib/stores/composition/stores-composition-insertion-live";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";
import type { StoreCouponCampaignRow } from "@/lib/stores/store-coupon-campaign-authority";

const baseAd = (id: string, storeId: string): StorePaidAdCampaignRow => ({
  id,
  storeId,
  placement: "stores_browse",
  title: `ad-${id}`,
  headline: "headline",
  bodyCopy: null,
  imageUrl: null,
  startAt: new Date(Date.now() - 3600_000).toISOString(),
  endAt: new Date(Date.now() + 86400_000).toISOString(),
  isActive: true,
});

const baseCoupon = (id: string, storeId: string): StoreCouponCampaignRow => ({
  id,
  storeId,
  title: `coupon-${id}`,
  discountType: "percent",
  discountValue: 10,
  minOrderAmount: 5000,
  termsCopy: "terms",
  startAt: new Date(Date.now() - 3600_000).toISOString(),
  endAt: new Date(Date.now() + 86400_000).toISOString(),
  isActive: true,
});

describe("planStoresBrowseInsertions", () => {
  it("preserves organic store order when insertions disabled", () => {
    const organic = ["s1", "s2", "s3", "s4"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd("a1", "s1")],
      coupons: [baseCoupon("c1", "s2")],
      policy: STORES_BROWSE_COMPOSITION_DEFAULT_POLICY,
    });
    expect(plan.organicIds).toEqual(organic);
    expect(plan.rows.filter((r) => r.kind === "organic").map((r) => r.storeId)).toEqual(organic);
    expect(plan.adCount).toBe(0);
    expect(plan.couponCount).toBe(0);
  });

  it("inserts ads without reordering remaining organic relative order; suppresses sponsored organic dup", () => {
    const policy = STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
      r.slot === "future_ad_insertion"
        ? { ...r, enabled: true, max: 2, interval: { consumed: true as const, everyN: 4 } }
        : r
    );
    const organic = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd("a1", "s1"), baseAd("a2", "s4")],
      coupons: [],
      policy,
    });
    expect(plan.organicIds).toEqual(organic);
    expect(plan.adCount).toBeGreaterThan(0);
    const organicOnly = plan.rows.filter((r) => r.kind === "organic").map((r) => r.storeId);
    /** Sponsored stores leave organic list; relative order of the rest preserved. */
    for (let i = 1; i < organicOnly.length; i += 1) {
      expect(organic.indexOf(organicOnly[i]!)).toBeGreaterThan(organic.indexOf(organicOnly[i - 1]!));
    }
    for (const row of plan.rows) {
      if (row.kind === "paid_ad") {
        expect(organic).toContain(row.storeId);
        expect(row.isSponsored).toBe(true);
      }
    }
  });

  it("hard-filters ads to organic browse-scope store ids; coupon paid-style rows never insert (CUT 8)", () => {
    const policy = STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
      r.slot === "future_ad_insertion" || r.slot === "future_coupon_insertion"
        ? { ...r, enabled: true, max: 5, interval: { consumed: true as const, everyN: 2 } }
        : r
    );
    const organic = ["restaurant-korean-1", "restaurant-korean-2"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd("a-mart", "mart-1"), baseAd("a-ok", "restaurant-korean-1")],
      coupons: [baseCoupon("c-mart", "mart-2"), baseCoupon("c-ok", "restaurant-korean-2")],
      policy,
    });
    expect(plan.adCount).toBe(1);
    expect(plan.couponCount).toBe(0);
    expect(plan.rows.some((r) => r.kind === "paid_ad" && r.storeId === "mart-1")).toBe(false);
    expect(plan.rows.some((r) => r.kind === "coupon")).toBe(false);
    expect(plan.rows.some((r) => r.kind === "paid_ad" && r.storeId === "restaurant-korean-1")).toBe(true);
  });
});
