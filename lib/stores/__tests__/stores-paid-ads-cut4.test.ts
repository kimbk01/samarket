import { describe, expect, it } from "vitest";
import {
  planStoresBrowseInsertions,
  planStoresHomeRestPaidInsertions,
  STORES_INSERTION_DEFAULT_INTERVAL,
} from "@/lib/stores/composition/stores-composition-insertion-live";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import {
  resolveStorePaidAdCampaignExposure,
  selectExposureEligibleStorePaidAds,
} from "@/lib/stores/store-paid-ad-exposure";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_COUPON_CAMPAIGN_TABLE } from "@/lib/stores/store-coupon-campaign-authority";
import { STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS } from "@/lib/stores/discovery-authority/monetization";
import { orderHomeRestStoresForPaidInsertion } from "@/lib/stores/product/stores-home-shelf-card-benefit";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const nowMs = Date.parse("2026-06-15T12:00:00.000Z");

const baseAd = (
  overrides: Partial<StorePaidAdCampaignRow> & Pick<StorePaidAdCampaignRow, "id" | "storeId">
): StorePaidAdCampaignRow => ({
  id: overrides.id,
  storeId: overrides.storeId,
  placement: overrides.placement ?? "stores_browse",
  title: overrides.title ?? `ad-${overrides.id}`,
  headline: overrides.headline ?? "headline",
  bodyCopy: overrides.bodyCopy ?? null,
  imageUrl: overrides.imageUrl ?? null,
  startAt: overrides.startAt ?? "2026-06-01T00:00:00.000Z",
  endAt: overrides.endAt ?? "2026-07-01T00:00:00.000Z",
  isActive: overrides.isActive ?? true,
});

function organicRelativeOrder(rows: Array<{ kind: string; storeId: string }>): string[] {
  return rows.filter((r) => r.kind === "organic").map((r) => r.storeId);
}

function browsePolicyAdOn(everyN = 4, max = 5) {
  return STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
    r.slot === "future_ad_insertion"
      ? { ...r, enabled: true, max, interval: { consumed: true as const, everyN } }
      : r
  );
}

describe("CUT 4 store paid ads exposure + insertion", () => {
  it("T1 active campaign eligible", () => {
    const campaign = baseAd({ id: "a1", storeId: "s1", placement: "stores_browse" });
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign,
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(exposure.actualExposureEligible).toBe(true);
    expect(exposure.blockingReasons).toEqual([]);
  });

  it("T2 inactive blocked", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: baseAd({ id: "a1", storeId: "s1", isActive: false }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("campaignActive");
  });

  it("T3 outside window blocked", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: baseAd({
        id: "a1",
        storeId: "s1",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-02-01T00:00:00.000Z",
      }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("windowActive");
  });

  it("T4 store ineligible blocked", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: baseAd({ id: "a1", storeId: "s1" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: false,
      taxonomyScopeMatched: true,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("storeEligible");
  });

  it("T5 placement mismatch blocked", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: baseAd({ id: "a1", storeId: "s1", placement: "stores_home" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("placementMatched");
  });

  it("T6 taxonomy scope mismatch blocked", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: baseAd({ id: "a1", storeId: "s1" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: false,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("taxonomyScopeMatched");
  });

  it("T7 surface disabled blocked", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: baseAd({ id: "a1", storeId: "s1" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: false,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("surfaceAllowed");
  });

  it("T8 blockingReasons deterministic", () => {
    const a = resolveStorePaidAdCampaignExposure({
      campaign: baseAd({ id: "a1", storeId: "s1", isActive: false, placement: "stores_home" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: false,
      storeEligible: false,
      taxonomyScopeMatched: false,
    });
    const b = resolveStorePaidAdCampaignExposure({
      campaign: baseAd({ id: "a1", storeId: "s1", isActive: false, placement: "stores_home" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: false,
      storeEligible: false,
      taxonomyScopeMatched: false,
    });
    expect(a.blockingReasons).toEqual(b.blockingReasons);
    expect(a.blockingReasons).toEqual([
      "campaignActive",
      "storeEligible",
      "placementMatched",
      "taxonomyScopeMatched",
      "surfaceAllowed",
    ]);
  });

  it("T9 HOME insertion only rest_stores plan (not purpose shelves)", () => {
    const organic = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const ads = [baseAd({ id: "h1", storeId: "a", placement: "stores_home" })];
    const on = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: ads,
      max: 5,
      intervalEveryN: 4,
      surfaceAllowed: true,
    });
    expect(on.adCount).toBe(1);
    expect(on.rows.some((r) => r.kind === "paid_ad" && r.isSponsored === true)).toBe(true);
    /** Purpose shelves are not this planner's output — planner only receives rest organic ids. */
    expect(on.organicIds).toEqual(organic);
  });

  it("T10 BROWSE insertion after organic + exposure filter", () => {
    const organic = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];
    const raw = [
      baseAd({ id: "ok", storeId: "s4", placement: "stores_browse" }),
      baseAd({ id: "out", storeId: "mart", placement: "stores_browse" }),
    ];
    const { eligible } = selectExposureEligibleStorePaidAds({
      campaigns: raw,
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      taxonomyMatchedStoreIds: new Set(organic),
    });
    expect(eligible.map((e) => e.id)).toEqual(["ok"]);
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: eligible,
      coupons: [],
      policy: browsePolicyAdOn(4, 5),
    });
    expect(plan.adCount).toBe(1);
    expect(plan.organicIds).toEqual(organic);
  });

  it("T11 organic relative order preserved", () => {
    const organic = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "x", storeId: "X", placement: "stores_browse" })],
      coupons: [],
      policy: browsePolicyAdOn(4, 5),
    });
    /** X not in organic — no insertion; organic order identical */
    expect(organicRelativeOrder(plan.rows)).toEqual(organic);

    const plan2 = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "b", storeId: "B", placement: "stores_browse" })],
      coupons: [],
      policy: browsePolicyAdOn(4, 5),
    });
    const organicOnly = organicRelativeOrder(plan2.rows);
    /** B suppressed as organic duplicate; remaining organic keep relative order */
    expect(organicOnly).toEqual(["A", "C", "D", "E", "F", "G", "H"]);
    const withoutSponsored = plan2.rows
      .filter((r) => r.kind !== "paid_ad")
      .map((r) => r.storeId);
    expect(withoutSponsored).toEqual(organicOnly);
  });

  it("T12 sponsored duplicate suppressed", () => {
    const organic = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "ad-b", storeId: "B" })],
      coupons: [],
      policy: browsePolicyAdOn(4, 5),
    });
    const storeAppearances = plan.rows.filter((r) => r.storeId === "B");
    expect(storeAppearances).toHaveLength(1);
    expect(storeAppearances[0]?.kind).toBe("paid_ad");
    expect(plan.sponsoredStoreIds).toContain("B");
  });

  it("T13 ads OFF restores organic baseline", () => {
    const organic = ["A", "B", "C", "D"];
    const ads = [baseAd({ id: "ad", storeId: "B" })];
    const offBrowse = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: ads,
      coupons: [],
      policy: STORES_BROWSE_COMPOSITION_DEFAULT_POLICY,
    });
    expect(offBrowse.rows.map((r) => r.storeId)).toEqual(organic);
    expect(offBrowse.adCount).toBe(0);

    const offHome = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: ads,
      max: 5,
      surfaceAllowed: false,
    });
    expect(offHome.rows.map((r) => r.storeId)).toEqual(organic);
    expect(offHome.adCount).toBe(0);
  });

  it("T14 sponsored label metadata", () => {
    const plan = planStoresHomeRestPaidInsertions({
      organicStoreIds: ["a", "b", "c", "d"],
      paidAds: [baseAd({ id: "ad", storeId: "a", placement: "stores_home" })],
      max: 5,
      intervalEveryN: 4,
      surfaceAllowed: true,
    });
    const paid = plan.rows.find((r) => r.kind === "paid_ad");
    expect(paid && paid.kind === "paid_ad" && paid.isSponsored).toBe(true);
  });

  it("T15 insertion interval/max canonical", () => {
    expect(STORES_INSERTION_DEFAULT_INTERVAL).toBe(8);
    const organic = Array.from({ length: 20 }, (_, i) => `s${i + 1}`);
    const ads = Array.from({ length: 10 }, (_, i) =>
      baseAd({ id: `a${i}`, storeId: `s${i + 1}` })
    );
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: ads,
      coupons: [],
      policy: browsePolicyAdOn(8, 2),
    });
    expect(plan.adCount).toBeLessThanOrEqual(2);
  });

  it("T16 Banner untouched (campaign table authority separate)", () => {
    expect(STORE_PAID_AD_CAMPAIGN_TABLE).toBe("store_paid_ad_campaigns");
    expect(STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS.BANNER_AD).toBe("store_banner_ad_campaigns");
    expect(STORES_DISCOVERY_MONETIZATION_TABLE_OWNERS.BANNER_AD).not.toBe(STORE_PAID_AD_CAMPAIGN_TABLE);
    const exposureSrc = readFileSync(
      join(process.cwd(), "lib/stores/store-paid-ad-exposure.ts"),
      "utf8"
    );
    expect(exposureSrc).not.toMatch(/store_banner_ad_campaigns|STORE_BANNER/);
  });

  it("T17 Coupon untouched (coupon table + path separate)", () => {
    expect(STORE_COUPON_CAMPAIGN_TABLE).toBe("store_coupon_campaigns");
    const insertionSrc = readFileSync(
      join(process.cwd(), "lib/stores/composition/stores-composition-insertion-live.ts"),
      "utf8"
    );
    expect(insertionSrc).toMatch(/homeCouponInsertions|kind: "coupon"/);
    expect(STORE_COUPON_CAMPAIGN_TABLE).not.toBe(STORE_PAID_AD_CAMPAIGN_TABLE);
  });

  it("HOME rest order helper preserves organic when ads off", () => {
    const stores = [
      { id: "a" },
      { id: "b" },
      { id: "c" },
    ] as StoreHomeFeedItem[];
    const ordered = orderHomeRestStoresForPaidInsertion(stores, {
      paidAds: [],
      coupons: [],
      restInsertion: {
        organicIds: ["a", "b", "c"],
        rows: [
          { kind: "organic", storeId: "a" },
          { kind: "organic", storeId: "b" },
          { kind: "organic", storeId: "c" },
        ],
        adCount: 0,
        sponsoredStoreIds: [],
        surfaceAllowed: false,
      },
    });
    expect(ordered.map((o) => o.store.id)).toEqual(["a", "b", "c"]);
    expect(ordered.every((o) => !o.isSponsored)).toBe(true);
  });
});
