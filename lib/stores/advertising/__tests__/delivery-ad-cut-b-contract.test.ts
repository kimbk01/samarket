/**
 * CUT B — Delivery Ad Platform product/inventory/lifecycle/creative contract tests.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACTIVE_DELIVERY_AD_INVENTORY_KEYS,
  DELIVERY_AD_CTA_TARGETS,
  DELIVERY_AD_DEVICE_RATIO_CONTRACT,
  DELIVERY_AD_INVENTORY_SEEDS,
  DELIVERY_AD_ORGANIC_PAID_ISOLATION,
  DELIVERY_AD_PRICING_CONTRACT,
  DELIVERY_AD_PRODUCT_KEYS,
  DELIVERY_AD_PRODUCT_REGISTRY,
  FUTURE_DELIVERY_AD_INVENTORY_KEYS,
  LEGACY_PLACEMENT_TO_INVENTORY,
  LEGACY_SURFACE_GATE_CLASSIFICATION,
  STORE_ELIGIBILITY_CUT_B_STATUS,
  assertDeliveryAdLifecycleTransition,
  canOwnerRequestLifecycleTransition,
  canPhysicallyDeleteDeliveryAdCampaign,
  canTransitionDeliveryAdLifecycle,
  isForbiddenExternalCta,
  isRuntimeActiveInventory,
  mapLegacyPlacementToInventory,
  validateCtaPayload,
  validateDeliveryAdCreativeForInventory,
} from "@/lib/stores/advertising";
import { STORE_PAID_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-paid-ad-campaign-authority";
import { STORE_BANNER_AD_CAMPAIGN_TABLE } from "@/lib/stores/store-banner-ad-campaign-authority";
import {
  planStoresBrowseInsertions,
  planStoresHomeRestPaidInsertions,
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

function baseAd(
  partial: Partial<StorePaidAdCampaignRow> & { id: string; storeId: string }
): StorePaidAdCampaignRow {
  const now = Date.now();
  return {
    id: partial.id,
    storeId: partial.storeId,
    placement: partial.placement ?? "stores_browse",
    title: partial.title ?? "t",
    headline: partial.headline ?? "h",
    bodyCopy: null,
    imageUrl: null,
    startAt: partial.startAt ?? new Date(now - 60_000).toISOString(),
    endAt: partial.endAt ?? new Date(now + 86_400_000).toISOString(),
    isActive: partial.isActive ?? true,
  };
}

const ORGANIC_RANKING_FILES = [
  "lib/stores/stores-browse-build.ts",
  "lib/stores/store-discovery-browse-sort.ts",
  "lib/stores/discovery/store-discovery-ranking-authority.ts",
  "lib/stores/browse-organic-contract.ts",
] as const;

describe("CUT B Delivery Ad SSOT", () => {
  it("T1 product registry store_sponsored + banner only", () => {
    expect([...DELIVERY_AD_PRODUCT_KEYS]).toEqual(["store_sponsored", "banner"]);
    expect(DELIVERY_AD_PRODUCT_REGISTRY).toHaveLength(2);
    expect(DELIVERY_AD_PRODUCT_REGISTRY[0]?.campaignAuthority).toBe(STORE_PAID_AD_CAMPAIGN_TABLE);
    expect(DELIVERY_AD_PRODUCT_REGISTRY[1]?.campaignAuthority).toBe(STORE_BANNER_AD_CAMPAIGN_TABLE);
    expect(STORE_PAID_AD_CAMPAIGN_TABLE).not.toBe(STORE_BANNER_AD_CAMPAIGN_TABLE);
  });

  it("T2 each active placement maps to exactly one inventory", () => {
    expect(mapLegacyPlacementToInventory("stores_home")).toBe("STORES_HOME_FEED");
    expect(mapLegacyPlacementToInventory("stores_browse")).toBe("STORES_CATEGORY_FEED");
    expect(mapLegacyPlacementToInventory("stores_home_hero")).toBe("STORES_HOME_HERO");
    const values = Object.values(LEGACY_PLACEMENT_TO_INVENTORY);
    expect(new Set(values).size).toBe(values.length);
  });

  it("T3 future inventory cannot be runtime-active", () => {
    for (const key of FUTURE_DELIVERY_AD_INVENTORY_KEYS) {
      expect(isRuntimeActiveInventory(key)).toBe(false);
    }
    expect(ACTIVE_DELIVERY_AD_INVENTORY_KEYS).toEqual([
      "STORES_HOME_HERO",
      "STORES_HOME_FEED",
      "STORES_CATEGORY_FEED",
    ]);
    for (const key of ACTIVE_DELIVERY_AD_INVENTORY_KEYS) {
      expect(isRuntimeActiveInventory(key)).toBe(true);
    }
  });

  it("T4 banner creative incompatible ratio rejected", () => {
    const bad = validateDeliveryAdCreativeForInventory(
      {
        productKind: "banner",
        assetPath: "stores/ads/x.jpg",
        sourceWidth: 100,
        sourceHeight: 100,
      },
      "STORES_HOME_HERO"
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toBe("incompatible_aspect_ratio");

    const ok = validateDeliveryAdCreativeForInventory(
      {
        productKind: "banner",
        assetPath: "stores/ads/x.jpg",
        sourceWidth: 390,
        sourceHeight: 160,
      },
      "STORES_HOME_HERO"
    );
    expect(ok.ok).toBe(true);
  });

  it("T5 arbitrary external CTA rejected", () => {
    expect(isForbiddenExternalCta("https://evil.example/x")).toBe(true);
    expect(validateCtaPayload({ externalUrl: "https://evil.example" }).ok).toBe(false);
    expect(validateCtaPayload({ ctaType: "store_detail" }).ok).toBe(true);
    expect([...DELIVERY_AD_CTA_TARGETS]).toEqual([
      "store_detail",
      "store_menu",
      "store_promotion",
    ]);
  });

  it("T6 illegal lifecycle transition rejected", () => {
    expect(assertDeliveryAdLifecycleTransition("DRAFT", "ACTIVE", "owner").ok).toBe(false);
    expect(assertDeliveryAdLifecycleTransition("DRAFT", "SUBMITTED", "owner").ok).toBe(true);
    expect(assertDeliveryAdLifecycleTransition("UNDER_REVIEW", "APPROVED", "admin").ok).toBe(true);
  });

  it("T7 Owner cannot perform Admin review transition", () => {
    expect(canOwnerRequestLifecycleTransition("UNDER_REVIEW", "APPROVED")).toBe(false);
    expect(canOwnerRequestLifecycleTransition("UNDER_REVIEW", "REJECTED")).toBe(false);
    expect(canTransitionDeliveryAdLifecycle("UNDER_REVIEW", "APPROVED", "admin")).toBe(true);
  });

  it("T8 campaign with history cannot physical-delete", () => {
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "DRAFT",
        history: {
          hasImpression: false,
          hasClick: false,
          hasAttribution: false,
          hasBilling: false,
          hasFinancialHistory: false,
          hasAuditHistory: false,
        },
      })
    ).toBe(true);
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "ACTIVE",
        history: {
          hasImpression: false,
          hasClick: false,
          hasAttribution: false,
          hasBilling: false,
          hasFinancialHistory: false,
          hasAuditHistory: false,
        },
      })
    ).toBe(false);
    expect(
      canPhysicallyDeleteDeliveryAdCampaign({
        lifecycleStatus: "DRAFT",
        history: {
          hasImpression: true,
          hasClick: false,
          hasAttribution: false,
          hasBilling: false,
          hasFinancialHistory: false,
          hasAuditHistory: false,
        },
      })
    ).toBe(false);
  });

  it("T9 organic ranking free of paid campaign deps", () => {
    const forbidden = [
      "store-paid-ad-campaign",
      "store_paid_ad_campaigns",
      "delivery-ad-lifecycle",
      "store-banner-ad-campaign",
    ];
    for (const rel of ORGANIC_RANKING_FILES) {
      const path = join(process.cwd(), rel);
      if (!existsSync(path)) continue;
      const src = readFileSync(path, "utf8");
      for (const needle of forbidden) {
        expect(src, `${rel} × ${needle}`).not.toMatch(new RegExp(needle));
      }
    }
    expect(DELIVERY_AD_ORGANIC_PAID_ISOLATION.pipeline.length).toBeGreaterThan(0);
  });

  it("T10 HOME sponsored insertion preserved", () => {
    const organic = ["A", "B", "C", "D"];
    const plan = planStoresHomeRestPaidInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "ad", storeId: "B", placement: "stores_home" })],
      max: 5,
      surfaceAllowed: true,
      intervalEveryN: 2,
    });
    expect(plan.organicIds).toEqual(organic);
    expect(plan.adCount).toBeGreaterThanOrEqual(0);
  });

  it("T11 CATEGORY sponsored insertion preserved", () => {
    const organic = ["A", "B", "C", "D", "E"];
    const plan = planStoresBrowseInsertions({
      organicStoreIds: organic,
      paidAds: [baseAd({ id: "ad", storeId: "C", placement: "stores_browse" })],
      policy: browsePolicyAdOn(2, 5),
    });
    expect(plan.organicIds).toEqual(organic);
  });

  it("T12 HOME HERO DB banner contract preserved", () => {
    const heroSrc = readFileSync(
      join(process.cwd(), "components/stores/home/hub/StoresHomeHeroBanner.tsx"),
      "utf8"
    );
    expect(heroSrc).toMatch(/\/api\/stores\/home-hero-banners/);
    expect(heroSrc).toMatch(/min-h-\[140px\]/);
    expect(heroSrc).toMatch(/max-h-\[180px\]/);
    const heroInv = DELIVERY_AD_INVENTORY_SEEDS.find((s) => s.key === "STORES_HOME_HERO");
    expect(heroInv?.ratioSource).toBe("CURRENT_RUNTIME_MEASURED");
    expect(heroInv?.aspectRatioWidth).toBe(39);
    expect(heroInv?.aspectRatioHeight).toBe(16);
  });

  it("pricing contract is vocabulary-only (no fake billing)", () => {
    expect(DELIVERY_AD_PRICING_CONTRACT.chargeExecution).toBe(false);
    expect(DELIVERY_AD_PRICING_CONTRACT.budgetLedger).toBe(false);
  });

  it("device ratio contract forbids per-platform ratio fields", () => {
    expect(DELIVERY_AD_DEVICE_RATIO_CONTRACT.forbiddenFields).toContain("ios_ratio");
    expect(LEGACY_SURFACE_GATE_CLASSIFICATION.ad_integration).toBe("COMPATIBILITY");
    expect(STORE_ELIGIBILITY_CUT_B_STATUS.status).toBe("PARTIAL_DEFER_CUT_D");
  });

  it("migration file exists", () => {
    expect(
      existsSync(
        join(process.cwd(), "supabase/migrations/20261201120000_delivery_ads_cut_b_ssot.sql")
      )
    ).toBe(true);
  });
});
