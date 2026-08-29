/**
 * CUT D — Store Sponsored runtime eligibility + dedupe (D1–D25).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STORE_ELIGIBILITY_CUT_D_STATUS,
  STORE_SPONSORED_BUDGET_GATE,
  buildStoreSponsoredEligibilityMapFromOrganicPool,
  dedupeSponsoredCampaignsOnePerStore,
  evaluateStoreSponsoredCampaignGates,
  evaluateStoreSponsoredExposureEligibility,
  isSponsoredScheduleActive,
  type StoreSponsoredRuntimeCampaign,
} from "@/lib/stores/advertising/store-sponsored-exposure-eligibility";
import { isRuntimeActiveInventory } from "@/lib/stores/advertising/delivery-ad-inventory";
import {
  resolveStorePaidAdCampaignExposure,
  selectExposureEligibleStorePaidAds,
} from "@/lib/stores/store-paid-ad-exposure";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";
import { compareStorePaidAdCampaigns } from "@/lib/stores/store-paid-ad-campaign-authority";
import {
  planStoresBrowseInsertions,
  planStoresHomeRestPaidInsertions,
} from "@/lib/stores/composition/stores-composition-insertion-live";
import { STORES_BROWSE_COMPOSITION_DEFAULT_POLICY } from "@/lib/stores/composition/stores-browse-composition-boundary";
import { DELIVERY_AD_ORGANIC_PAID_ISOLATION } from "@/lib/stores/advertising/delivery-ad-domain";

const nowMs = Date.parse("2026-06-15T12:00:00.000Z");

function runtimeCampaign(
  overrides: Partial<StoreSponsoredRuntimeCampaign> &
    Pick<StoreSponsoredRuntimeCampaign, "id" | "storeId">
): StoreSponsoredRuntimeCampaign {
  return {
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
    lifecycleStatus: overrides.lifecycleStatus ?? "ACTIVE",
    reviewStatus: overrides.reviewStatus ?? "APPROVED",
    inventoryKeys: overrides.inventoryKeys ?? ["STORES_CATEGORY_FEED"],
  };
}

function paidRow(
  overrides: Partial<StorePaidAdCampaignRow> & Pick<StorePaidAdCampaignRow, "id" | "storeId">
): StorePaidAdCampaignRow {
  return {
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
    lifecycleStatus: overrides.lifecycleStatus ?? "ACTIVE",
    reviewStatus: overrides.reviewStatus ?? "APPROVED",
    inventoryKeys: overrides.inventoryKeys ?? ["STORES_CATEGORY_FEED"],
  };
}

function browsePolicyAdOn(everyN = 4, max = 5) {
  return STORES_BROWSE_COMPOSITION_DEFAULT_POLICY.map((r) =>
    r.slot === "future_ad_insertion"
      ? { ...r, enabled: true, max, interval: { consumed: true as const, everyN } }
      : r
  );
}

function organicRelativeOrder(rows: Array<{ kind: string; storeId: string }>): string[] {
  return rows.filter((r) => r.kind === "organic").map((r) => r.storeId);
}

describe("CUT D store sponsored exposure eligibility", () => {
  it("D1 ACTIVE + APPROVED + schedule + inventory + eligible store → eligible", () => {
    const campaign = runtimeCampaign({ id: "c1", storeId: "s1" });
    const gates = evaluateStoreSponsoredExposureEligibility({
      campaign,
      surface: "STORES_CATEGORY_FEED",
      nowMs,
      storeEligibleById: new Map([["s1", true]]),
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(gates.ok).toBe(true);
    expect(gates.reasons).toEqual([]);
  });

  it("D2 SUBMITTED → not eligible", () => {
    const byLifecycle = evaluateStoreSponsoredCampaignGates({
      campaign: runtimeCampaign({
        id: "c1",
        storeId: "s1",
        lifecycleStatus: "SUBMITTED",
        reviewStatus: "PENDING",
        isActive: false,
      }),
      surface: "STORES_CATEGORY_FEED",
      nowMs,
    });
    expect(byLifecycle.ok).toBe(false);
    expect(byLifecycle.reasons).toContain("campaign_ACTIVE");

    const byReview = evaluateStoreSponsoredCampaignGates({
      campaign: runtimeCampaign({
        id: "c1",
        storeId: "s1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "PENDING",
      }),
      surface: "STORES_CATEGORY_FEED",
      nowMs,
    });
    expect(byReview.ok).toBe(false);
    expect(byReview.reasons).toContain("review_approved");
  });

  it("D3 PAUSED_OWNER → not eligible", () => {
    const gates = evaluateStoreSponsoredCampaignGates({
      campaign: runtimeCampaign({
        id: "c1",
        storeId: "s1",
        lifecycleStatus: "PAUSED_OWNER",
        isActive: false,
      }),
      surface: "STORES_CATEGORY_FEED",
      nowMs,
    });
    expect(gates.ok).toBe(false);
    expect(gates.reasons).toContain("campaign_ACTIVE");
  });

  it("D4 PAUSED_ADMIN → not eligible", () => {
    const gates = evaluateStoreSponsoredCampaignGates({
      campaign: runtimeCampaign({
        id: "c1",
        storeId: "s1",
        lifecycleStatus: "PAUSED_ADMIN",
        isActive: false,
      }),
      surface: "STORES_CATEGORY_FEED",
      nowMs,
    });
    expect(gates.ok).toBe(false);
    expect(gates.reasons).toContain("campaign_ACTIVE");
  });

  it("D5 ENDED / TERMINATED / ARCHIVED → not eligible", () => {
    for (const lifecycleStatus of ["ENDED", "TERMINATED", "ARCHIVED"] as const) {
      const gates = evaluateStoreSponsoredCampaignGates({
        campaign: runtimeCampaign({
          id: "c1",
          storeId: "s1",
          lifecycleStatus,
          isActive: false,
        }),
        surface: "STORES_CATEGORY_FEED",
        nowMs,
      });
      expect(gates.ok).toBe(false);
      expect(gates.reasons).toContain("campaign_ACTIVE");
    }
  });

  it("D6 review != APPROVED → not eligible", () => {
    for (const reviewStatus of [
      "IN_REVIEW",
      "PENDING",
      "CHANGES_REQUESTED",
      "REJECTED",
      "NOT_SUBMITTED",
    ] as const) {
      const gates = evaluateStoreSponsoredCampaignGates({
        campaign: runtimeCampaign({ id: "c1", storeId: "s1", reviewStatus }),
        surface: "STORES_CATEGORY_FEED",
        nowMs,
      });
      expect(gates.ok).toBe(false);
      expect(gates.reasons).toContain("review_approved");
    }
  });

  it("D7 outside schedule → not eligible", () => {
    expect(
      isSponsoredScheduleActive(
        "2026-01-01T00:00:00.000Z",
        "2026-02-01T00:00:00.000Z",
        nowMs
      )
    ).toBe(false);
    const gates = evaluateStoreSponsoredCampaignGates({
      campaign: runtimeCampaign({
        id: "c1",
        storeId: "s1",
        startAt: "2026-01-01T00:00:00.000Z",
        endAt: "2026-02-01T00:00:00.000Z",
      }),
      surface: "STORES_CATEGORY_FEED",
      nowMs,
    });
    expect(gates.ok).toBe(false);
    expect(gates.reasons).toContain("schedule_active");
  });

  it("D8 inventory inactive / mismatch → not eligible", () => {
    expect(isRuntimeActiveInventory("STORES_SEARCH_TOP")).toBe(false);
    const mismatch = evaluateStoreSponsoredCampaignGates({
      campaign: runtimeCampaign({
        id: "c1",
        storeId: "s1",
        placement: "stores_browse",
        inventoryKeys: ["STORES_HOME_FEED"],
      }),
      surface: "STORES_CATEGORY_FEED",
      nowMs,
    });
    expect(mismatch.ok).toBe(false);
    expect(mismatch.reasons).toContain("inventory_match");
  });

  it("D9 store not approved / not in eligibility map → not eligible", () => {
    const gates = evaluateStoreSponsoredExposureEligibility({
      campaign: runtimeCampaign({ id: "c1", storeId: "s1" }),
      surface: "STORES_CATEGORY_FEED",
      nowMs,
      storeEligibleById: new Map([["s1", false]]),
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(gates.ok).toBe(false);
    expect(gates.reasons).toContain("store_eligible");
  });

  it("D10 store hidden (missing from organic pool map) → not eligible", () => {
    const gates = evaluateStoreSponsoredExposureEligibility({
      campaign: runtimeCampaign({ id: "c1", storeId: "hidden" }),
      surface: "STORES_CATEGORY_FEED",
      nowMs,
      storeEligibleById: buildStoreSponsoredEligibilityMapFromOrganicPool(["s1", "s2"]),
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(gates.ok).toBe(false);
    expect(gates.reasons).toContain("store_eligible");
  });

  it("D11 delivery/serviceability fail → not eligible", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: paidRow({ id: "c1", storeId: "s1" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: false,
      taxonomyScopeMatched: true,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("storeEligible");
  });

  it("D12 CATEGORY taxonomy mismatch → not eligible", () => {
    const exposure = resolveStorePaidAdCampaignExposure({
      campaign: paidRow({ id: "c1", storeId: "s1" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: false,
    });
    expect(exposure.actualExposureEligible).toBe(false);
    expect(exposure.blockingReasons).toContain("taxonomyScopeMatched");
  });

  it("D13 HOME eligible path", () => {
    const campaign = runtimeCampaign({
      id: "h1",
      storeId: "s1",
      placement: "stores_home",
      inventoryKeys: ["STORES_HOME_FEED"],
    });
    const gates = evaluateStoreSponsoredExposureEligibility({
      campaign,
      surface: "STORES_HOME_FEED",
      nowMs,
      storeEligibleById: new Map([["s1", true]]),
      taxonomyScopeMatched: true,
      surfaceAllowed: true,
    });
    expect(gates.ok).toBe(true);

    const { eligible } = selectExposureEligibleStorePaidAds({
      campaigns: [
        paidRow({
          id: "h1",
          storeId: "s1",
          placement: "stores_home",
          inventoryKeys: ["STORES_HOME_FEED"],
        }),
      ],
      nowMs,
      targetPlacement: "stores_home",
      surfaceAllowed: true,
      taxonomyMatchedStoreIds: new Set(["s1"]),
      storeEligibleById: new Map([["s1", true]]),
    });
    expect(eligible.map((e) => e.id)).toEqual(["h1"]);
  });

  it("D14 CATEGORY eligible path", () => {
    const { eligible } = selectExposureEligibleStorePaidAds({
      campaigns: [paidRow({ id: "b1", storeId: "s1" })],
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      taxonomyMatchedStoreIds: new Set(["s1"]),
      storeEligibleById: new Map([["s1", true]]),
    });
    expect(eligible.map((e) => e.id)).toEqual(["b1"]);
  });

  it("D15 no null → true fallback remains", () => {
    expect(STORE_ELIGIBILITY_CUT_D_STATUS.nullToTrueFallback).toBe("REMOVED");
    const { eligible } = selectExposureEligibleStorePaidAds({
      campaigns: [paidRow({ id: "c1", storeId: "s1" })],
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      taxonomyMatchedStoreIds: new Set(["s1"]),
      storeEligibleById: null,
    });
    expect(eligible).toEqual([]);

    const omitted = selectExposureEligibleStorePaidAds({
      campaigns: [paidRow({ id: "c1", storeId: "s1" })],
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      taxonomyMatchedStoreIds: new Set(["s1"]),
    });
    expect(omitted.eligible).toEqual([]);

    const exposureSrc = readFileSync(
      join(process.cwd(), "lib/stores/store-paid-ad-exposure.ts"),
      "utf8"
    );
    expect(exposureSrc).not.toMatch(/storeEligibleById\s*==\s*null\s*\?\s*true/);
    expect(exposureSrc).toMatch(/eligibilityMap == null \? false/);

    const homeSrc = readFileSync(
      join(process.cwd(), "lib/stores/composition/stores-composition-home-insertion-meta.ts"),
      "utf8"
    );
    const browseSrc = readFileSync(
      join(process.cwd(), "lib/stores/composition/stores-composition-browse-insertion-meta.ts"),
      "utf8"
    );
    expect(homeSrc).not.toMatch(/storeEligibleById:\s*null/);
    expect(browseSrc).not.toMatch(/storeEligibleById:\s*null/);
    expect(homeSrc).toMatch(/buildStoreSponsoredEligibilityMapFromOrganicPool/);
    expect(browseSrc).toMatch(/buildStoreSponsoredEligibilityMapFromOrganicPool/);
  });

  it("D16 organic relative order preserved", () => {
    const organic = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [paidRow({ id: "ad", storeId: "B" })],
      coupons: [],
      policy: browsePolicyAdOn(4, 5),
    });
    expect(organicRelativeOrder(plan.rows)).toEqual(["A", "C", "D", "E", "F", "G", "H"]);
  });

  it("D17 organic+sponsored duplicate store deduped", () => {
    const organic = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [paidRow({ id: "ad-b", storeId: "B" })],
      coupons: [],
      policy: browsePolicyAdOn(4, 5),
    });
    const appearances = plan.rows.filter((r) => r.storeId === "B");
    expect(appearances).toHaveLength(1);
    expect(appearances[0]?.kind).toBe("paid_ad");
  });

  it("D18 same sponsored store cannot occupy multiple slots", () => {
    const campaigns = [
      paidRow({ id: "a-late", storeId: "s1", endAt: "2026-08-01T00:00:00.000Z" }),
      paidRow({ id: "a-early", storeId: "s1", endAt: "2026-07-01T00:00:00.000Z" }),
      paidRow({ id: "b1", storeId: "s2" }),
    ];
    const { eligible } = selectExposureEligibleStorePaidAds({
      campaigns,
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      taxonomyMatchedStoreIds: new Set(["s1", "s2"]),
      storeEligibleById: new Map([
        ["s1", true],
        ["s2", true],
      ]),
    });
    expect(eligible.filter((e) => e.storeId === "s1")).toHaveLength(1);
    expect(eligible.map((e) => e.id)).toEqual(["a-early", "b1"]);

    const deduped = dedupeSponsoredCampaignsOnePerStore(campaigns, compareStorePaidAdCampaigns);
    expect(deduped.filter((c) => c.storeId === "s1")).toHaveLength(1);
  });

  it("D19 0 paid candidates leaves organic output unchanged", () => {
    const organic = ["A", "B", "C", "D"];
    const browse = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [],
      coupons: [],
      policy: browsePolicyAdOn(4, 5),
    });
    expect(browse.rows.map((r) => r.storeId)).toEqual(organic);
    expect(browse.adCount).toBe(0);

    const home = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: [],
      max: 5,
      surfaceAllowed: true,
    });
    expect(home.rows.map((r) => r.storeId)).toEqual(organic);
    expect(home.adCount).toBe(0);
  });

  it("D20 paid resolver failure fails closed without breaking organic", () => {
    const homeSrc = readFileSync(
      join(process.cwd(), "lib/stores/composition/stores-composition-home-insertion-meta.ts"),
      "utf8"
    );
    const browseSrc = readFileSync(
      join(process.cwd(), "lib/stores/composition/stores-composition-browse-insertion-meta.ts"),
      "utf8"
    );
    const loaderSrc = readFileSync(
      join(process.cwd(), "lib/stores/load-store-insertion-campaigns.ts"),
      "utf8"
    );
    expect(homeSrc).toMatch(/catch \(e\)/);
    expect(homeSrc).toMatch(/emptyHomeInsertionMeta/);
    expect(browseSrc).toMatch(/catch \(e\)/);
    expect(browseSrc).toMatch(/adCount: 0/);
    expect(loaderSrc).toMatch(/Fail-closed/);
    expect(loaderSrc).toMatch(/return \[\]/);
  });

  it("D21 Sponsored label preserved", () => {
    const plan = planStoresHomeRestPaidInsertions({
      organicStoreIds: ["a", "b", "c", "d"],
      paidAds: [
        paidRow({
          id: "ad",
          storeId: "a",
          placement: "stores_home",
          inventoryKeys: ["STORES_HOME_FEED"],
        }),
      ],
      max: 5,
      intervalEveryN: 4,
      surfaceAllowed: true,
    });
    const paid = plan.rows.find((r) => r.kind === "paid_ad");
    expect(paid && paid.kind === "paid_ad" && paid.isSponsored).toBe(true);

    const catalog = readFileSync(
      join(process.cwd(), "lib/i18n/catalog/store-commerce-ui.ts"),
      "utf8"
    );
    expect(catalog).toMatch(/store_insertion_sponsored:\s*"광고"/);
  });

  it("D22 Owner ACTIVE→PAUSED_OWNER removes exposure eligibility", () => {
    const active = resolveStorePaidAdCampaignExposure({
      campaign: paidRow({ id: "c1", storeId: "s1", lifecycleStatus: "ACTIVE" }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(active.actualExposureEligible).toBe(true);

    const paused = resolveStorePaidAdCampaignExposure({
      campaign: paidRow({
        id: "c1",
        storeId: "s1",
        lifecycleStatus: "PAUSED_OWNER",
        isActive: false,
      }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(paused.actualExposureEligible).toBe(false);
  });

  it("D23 PAUSED_OWNER→ACTIVE restores eligibility when other gates valid", () => {
    const resumed = resolveStorePaidAdCampaignExposure({
      campaign: paidRow({
        id: "c1",
        storeId: "s1",
        lifecycleStatus: "ACTIVE",
        reviewStatus: "APPROVED",
        isActive: true,
      }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(resumed.actualExposureEligible).toBe(true);
  });

  it("D24 ENDED never restores exposure", () => {
    const ended = resolveStorePaidAdCampaignExposure({
      campaign: paidRow({
        id: "c1",
        storeId: "s1",
        lifecycleStatus: "ENDED",
        isActive: false,
      }),
      nowMs,
      targetPlacement: "stores_browse",
      surfaceAllowed: true,
      storeEligible: true,
      taxonomyScopeMatched: true,
    });
    expect(ended.actualExposureEligible).toBe(false);
  });

  it("D25 organic ranking modules still have zero paid dependency", () => {
    expect(DELIVERY_AD_ORGANIC_PAID_ISOLATION.forbidden).toContain("organicScore += paidBoost");
    expect(STORE_SPONSORED_BUDGET_GATE.status).toBe("BILLING_NOT_LAUNCHED");

    const discoveryDir = join(process.cwd(), "lib/stores/discovery");
    const rankingFiles = [
      "store-discovery-ranking-authority.ts",
      "store-discovery-shadow-adapter.ts",
      "store-discovery-shadow-ranked.ts",
    ];
    for (const file of rankingFiles) {
      const path = join(discoveryDir, file);
      const src = readFileSync(path, "utf8");
      expect(src).not.toMatch(/store-paid-ad-exposure|store_paid_ad_campaigns|STORE_PAID_AD/);
      expect(src).not.toMatch(/organicScore\s*\+=\s*paid/);
    }
  });
});
