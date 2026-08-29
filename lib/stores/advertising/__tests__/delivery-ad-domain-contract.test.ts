/**
 * CUT A — Delivery Ad Platform domain contract tests.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTIVE_DELIVERY_AD_PLACEMENTS,
  BANNER_AD_CAMPAIGN_TABLE,
  BANNER_AD_DB_SURFACE,
  COMPATIBILITY_SURFACE_POLICY_KEYS,
  DELIVERY_AD_CAMPAIGN_NE_EXPOSURE,
  DELIVERY_AD_ISOLATED_AUTHORITIES,
  DELIVERY_AD_ORGANIC_PAID_ISOLATION,
  DELIVERY_AD_PRODUCT_KINDS,
  DELIVERY_MONETIZATION_KINDS,
  DELIVERY_MONETIZATION_TABLE_OWNERS,
  FUTURE_DELIVERY_AD_PLACEMENTS,
  STORE_ELIGIBILITY_CUT_A_STATUS,
  STORE_SPONSORED_CAMPAIGN_TABLE,
  isDeliveryAdProductKind,
  isFutureDeliveryAdPlacement,
  isRuntimeDeliveryAdPlacement,
  mapStorePaidAdDbPlacementToActive,
  monetizationKindToAdProduct,
} from "@/lib/stores/advertising";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import {
  planStoresBrowseInsertions,
  type StoresBrowseInsertionItem,
} from "@/lib/stores/composition/stores-composition-insertion-live";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import type { StorePaidAdCampaignRow } from "@/lib/stores/store-paid-ad-campaign-authority";

function browsePolicyAdOn(everyN: number, max: number): StoresCompositionSectionContract[] {
  return [
    {
      surface: "browse",
      slot: "organic_discovery_list",
      contentType: "store",
      enabled: true,
      order: 0,
      interval: { consumed: false, reason: "NOT_CONSUMED" },
      max: null,
      titleAuthority: "none",
    },
    {
      surface: "browse",
      slot: "future_ad_insertion",
      contentType: "ad",
      enabled: true,
      order: 1,
      interval: { consumed: true, everyN },
      max,
      titleAuthority: "none",
    },
  ];
}

function baseAd(partial: Partial<StorePaidAdCampaignRow> & { id: string; storeId: string }): StorePaidAdCampaignRow {
  const now = Date.now();
  return {
    id: partial.id,
    storeId: partial.storeId,
    placement: partial.placement ?? "stores_browse",
    title: partial.title ?? "t",
    headline: partial.headline ?? "h",
    bodyCopy: partial.bodyCopy ?? null,
    imageUrl: partial.imageUrl ?? null,
    startAt: partial.startAt ?? new Date(now - 60_000).toISOString(),
    endAt: partial.endAt ?? new Date(now + 86_400_000).toISOString(),
    isActive: partial.isActive ?? true,
  };
}

function organicRelativeOrder(rows: readonly StoresBrowseInsertionItem[]): string[] {
  return rows.filter((r) => r.kind === "organic").map((r) => r.storeId);
}

const ORGANIC_RANKING_FILES = [
  "lib/stores/stores-browse-build.ts",
  "lib/stores/store-discovery-browse-sort.ts",
  "lib/stores/discovery/store-discovery-ranking-authority.ts",
  "lib/stores/browse-organic-contract.ts",
] as const;

describe("CUT A Delivery Ad domain contract", () => {
  it("A — store_sponsored and banner are distinct products / table owners", () => {
    expect(DELIVERY_AD_PRODUCT_KINDS).toEqual(["store_sponsored", "banner"]);
    expect(STORE_SPONSORED_CAMPAIGN_TABLE).toBe("store_paid_ad_campaigns");
    expect(BANNER_AD_CAMPAIGN_TABLE).toBe("store_banner_ad_campaigns");
    expect(STORE_SPONSORED_CAMPAIGN_TABLE).not.toBe(BANNER_AD_CAMPAIGN_TABLE);
    expect(STORE_PAID_AD_CAMPAIGN_TABLE).toBe(STORE_SPONSORED_CAMPAIGN_TABLE);
    expect(STORE_BANNER_AD_CAMPAIGN_TABLE).toBe(BANNER_AD_CAMPAIGN_TABLE);
    expect(DELIVERY_MONETIZATION_TABLE_OWNERS.store_paid_ad).toBe(STORE_SPONSORED_CAMPAIGN_TABLE);
    expect(DELIVERY_MONETIZATION_TABLE_OWNERS.banner_ad).toBe(BANNER_AD_CAMPAIGN_TABLE);
  });

  it("B — coupon / editorial / delivery_fee_promotion are not DeliveryAdProductKind", () => {
    for (const kind of ["coupon", "editorial_promotion", "delivery_fee_promotion"] as const) {
      expect(DELIVERY_MONETIZATION_KINDS).toContain(kind);
      expect(monetizationKindToAdProduct(kind)).toBeNull();
      expect(isDeliveryAdProductKind(kind)).toBe(false);
    }
    expect(isDeliveryAdProductKind("store_sponsored")).toBe(true);
    expect(isDeliveryAdProductKind("banner")).toBe(true);
  });

  it("C — paid insertion preserves organic relative order", () => {
    const organic = ["A", "B", "C", "D", "E"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "x", storeId: "X", placement: "stores_browse" })],
      policy: browsePolicyAdOn(2, 5),
    });
    /** X not in organic pool → no ad; organic order identical */
    expect(organicRelativeOrder(plan.rows)).toEqual(organic);
    expect(plan.organicIds).toEqual(organic);

    const withSponsored = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "ad-x", storeId: "C", placement: "stores_browse" })],
      policy: browsePolicyAdOn(2, 5),
    });
    /** Organic relative order among remaining organics preserved (C may move to sponsored). */
    const organicOnly = organicRelativeOrder(withSponsored.rows);
    for (let i = 1; i < organicOnly.length; i += 1) {
      const prev = organic.indexOf(organicOnly[i - 1]!);
      const cur = organic.indexOf(organicOnly[i]!);
      expect(cur).toBeGreaterThan(prev);
    }
    expect(withSponsored.organicIds).toEqual(organic);
  });

  it("D — organic ranking modules do not import paid campaign authority", () => {
    const forbidden = [
      "store-paid-ad-campaign",
      "store-paid-ad-exposure",
      "store_paid_ad_campaigns",
      "store-banner-ad-campaign",
      "lib/stores/advertising",
    ];
    for (const rel of ORGANIC_RANKING_FILES) {
      const path = join(process.cwd(), rel);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      for (const needle of forbidden) {
        expect(src, `${rel} must not import ${needle}`).not.toMatch(new RegExp(needle));
      }
    }
    expect(DELIVERY_AD_ORGANIC_PAID_ISOLATION.forbidden.length).toBeGreaterThan(0);
  });

  it("E — Trade/Community feed_ad_campaigns isolated from DeliveryAdProductKind", () => {
    expect(DELIVERY_AD_ISOLATED_AUTHORITIES.trade_community_feed_ads).toBe("feed_ad_campaigns");
    expect(DELIVERY_AD_ISOLATED_AUTHORITIES.store_detail_banners).toBe("store_banners");
    expect(DELIVERY_AD_ISOLATED_AUTHORITIES.editorial_promotion).toBe("store_discovery_campaigns");
    expect(DELIVERY_AD_ISOLATED_AUTHORITIES.coupon).toBe("store_coupon_campaigns");
    expect(isDeliveryAdProductKind("feed_ad_campaigns")).toBe(false);
    expect(Object.values(DELIVERY_MONETIZATION_TABLE_OWNERS)).not.toContain("feed_ad_campaigns");
    expect(Object.values(DELIVERY_MONETIZATION_TABLE_OWNERS)).not.toContain("store_banners");
  });

  it("placement ACTIVE vs FUTURE — future not runtime-valid", () => {
    expect(ACTIVE_DELIVERY_AD_PLACEMENTS).toEqual([
      "stores_home_feed",
      "stores_category_feed",
      "stores_home_hero",
    ]);
    expect(FUTURE_DELIVERY_AD_PLACEMENTS).toContain("stores_search");
    expect(FUTURE_DELIVERY_AD_PLACEMENTS).toContain("store_detail_recommendation");
    expect(isRuntimeDeliveryAdPlacement("stores_search")).toBe(false);
    expect(isFutureDeliveryAdPlacement("stores_search")).toBe(true);
    expect(isRuntimeDeliveryAdPlacement("stores_home_feed")).toBe(true);
    expect(mapStorePaidAdDbPlacementToActive("stores_home")).toBe("stores_home_feed");
    expect(mapStorePaidAdDbPlacementToActive("stores_browse")).toBe("stores_category_feed");
    expect(BANNER_AD_DB_SURFACE).toBe("stores_home_hero");
  });

  it("campaign ≠ exposure layers + surface policy compatibility", () => {
    expect(DELIVERY_AD_CAMPAIGN_NE_EXPOSURE.rule).toBe("campaign_exists_is_not_exposure");
    expect(DELIVERY_AD_CAMPAIGN_NE_EXPOSURE.requiredLayers).toEqual([
      "CAMPAIGN",
      "SURFACE_POLICY",
      "ELIGIBILITY",
      "INSERTION_PLAN",
    ]);
    expect(COMPATIBILITY_SURFACE_POLICY_KEYS).toEqual([
      "ad_integration",
      "ad_enabled",
      "homePaidAdInsertion",
    ]);
    expect(STORE_ELIGIBILITY_CUT_A_STATUS.status).toBe("PARTIAL_DEFER_CUT_D");
  });
});
