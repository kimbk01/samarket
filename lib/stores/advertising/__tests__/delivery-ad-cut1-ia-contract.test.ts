/**
 * PRODUCT CUT 1 — placement language / next-action / policy counts / home policy summary.
 */
import { describe, expect, it } from "vitest";
import {
  deliveryAdPlacementI18nKey,
  deliveryAdPolicyScreenHref,
  deliveryAdsAdminHubHref,
} from "@/lib/stores/advertising/delivery-ad-placement-language";
import {
  ownerDeliveryAdNextActions,
  ownerDeliveryAdPrimaryNextAction,
} from "@/lib/stores/advertising/delivery-ad-owner-next-action";
import {
  bucketPolicyCampaignCounts,
  isPolicyLinkedCampaign,
} from "@/lib/stores/advertising/delivery-ad-policy-campaign-counts";
import { resolveHomePaidPlacementPolicySummary } from "@/lib/stores/advertising/delivery-ad-home-placement-policy";
import { STORES_INSERTION_DEFAULT_INTERVAL } from "@/lib/stores/composition/stores-composition-insertion-live";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";

describe("deliveryAdPlacementI18nKey", () => {
  it("maps known inventories to human keys (no raw key as label)", () => {
    expect(deliveryAdPlacementI18nKey("STORES_HOME_FEED")).toBe("owner_ads_inventory_home");
    expect(deliveryAdPlacementI18nKey("STORES_CATEGORY_FEED")).toBe(
      "owner_ads_inventory_category"
    );
    expect(deliveryAdPlacementI18nKey("STORES_HOME_HERO")).toBe(
      "owner_ads_inventory_home_hero"
    );
    expect(deliveryAdPlacementI18nKey("STORES_SEARCH_TOP")).toBe(
      "owner_ads_inventory_search_top"
    );
    expect(deliveryAdPlacementI18nKey("UNKNOWN")).toBe("owner_ads_inventory_unknown");
  });

  it("builds policy reverse links and hub filters", () => {
    expect(deliveryAdPolicyScreenHref("STORES_HOME_FEED")).toBe("/admin/stores-home-shelves");
    expect(
      deliveryAdPolicyScreenHref("STORES_CATEGORY_FEED", {
        primarySlug: "restaurant",
        subSlug: "korean",
      })
    ).toBe("/admin/stores-category-policy?primary=restaurant&sub=korean");
    expect(deliveryAdsAdminHubHref({ inventory: "STORES_HOME_FEED" })).toBe(
      "/admin/delivery-ads?inventory=STORES_HOME_FEED"
    );
  });
});

describe("ownerDeliveryAdNextActions", () => {
  const base = {
    storeId: "s1",
    campaignId: "c1",
  };

  it("CHANGES_REQUESTED is product-aware for edit href", () => {
    const sponsored = ownerDeliveryAdNextActions({
      ...base,
      lifecycleStatus: "CHANGES_REQUESTED",
      productKind: "store_sponsored",
    });
    const banner = ownerDeliveryAdNextActions({
      ...base,
      lifecycleStatus: "CHANGES_REQUESTED",
      productKind: "banner",
    });
    const sHref = sponsored.find((a) => a.kind === "href");
    const bHref = banner.find((a) => a.kind === "href");
    expect(sHref?.kind === "href" && sHref.href).toContain("store-sponsored");
    expect(sHref?.kind === "href" && sHref.href).toContain("campaignId=c1");
    expect(bHref?.kind === "href" && bHref.href).toContain("banner");
    expect(bHref?.kind === "href" && bHref.href).toContain("campaignId=c1");
    expect(sponsored.some((a) => a.kind === "action" && a.action === "resubmit")).toBe(true);
  });

  it("PAUSED_ADMIN has no owner resume", () => {
    const actions = ownerDeliveryAdNextActions({
      ...base,
      lifecycleStatus: "PAUSED_ADMIN",
      productKind: "store_sponsored",
    });
    expect(actions).toEqual([]);
  });

  it("ACTIVE offers pause/end; primary prefers edit when present", () => {
    const active = ownerDeliveryAdNextActions({
      ...base,
      lifecycleStatus: "ACTIVE",
      productKind: "banner",
    });
    expect(active.map((a) => (a.kind === "action" ? a.action : a.labelKey))).toEqual([
      "pause",
      "end",
    ]);
    const draftPrimary = ownerDeliveryAdPrimaryNextAction({
      ...base,
      lifecycleStatus: "DRAFT",
      productKind: "banner",
    });
    expect(draftPrimary?.kind).toBe("href");
  });
});

describe("bucketPolicyCampaignCounts", () => {
  const rows = [
    {
      inventoryKeys: ["STORES_HOME_FEED"],
      lifecycleStatus: "ACTIVE" as const,
      storePrimarySlug: "restaurant",
      storeSubSlug: "korean",
    },
    {
      inventoryKeys: ["STORES_CATEGORY_FEED"],
      lifecycleStatus: "ACTIVE" as const,
      storePrimarySlug: "restaurant",
      storeSubSlug: "korean",
    },
    {
      inventoryKeys: ["STORES_CATEGORY_FEED"],
      lifecycleStatus: "UNDER_REVIEW" as const,
      storePrimarySlug: "restaurant",
      storeSubSlug: "chinese",
    },
    {
      inventoryKeys: ["STORES_CATEGORY_FEED"],
      lifecycleStatus: "SUBMITTED" as const,
      storePrimarySlug: "cafe",
      storeSubSlug: null,
    },
  ];

  it("HOME counts ignore taxonomy", () => {
    expect(
      bucketPolicyCampaignCounts(rows, { inventoryKey: "STORES_HOME_FEED" })
    ).toEqual({ linked: 1, exposable_now: 1, under_review: 0 });
  });

  it("BROWSE counts are taxonomy-scoped and metrics stay separate", () => {
    expect(
      bucketPolicyCampaignCounts(rows, {
        inventoryKey: "STORES_CATEGORY_FEED",
        primarySlug: "restaurant",
        subSlug: "korean",
      })
    ).toEqual({ linked: 1, exposable_now: 1, under_review: 0 });

    expect(
      bucketPolicyCampaignCounts(rows, {
        inventoryKey: "STORES_CATEGORY_FEED",
        primarySlug: "restaurant",
      })
    ).toEqual({ linked: 2, exposable_now: 1, under_review: 1 });

    expect(
      isPolicyLinkedCampaign(rows[3]!, {
        inventoryKey: "STORES_CATEGORY_FEED",
        primarySlug: "restaurant",
      })
    ).toBe(false);
  });
});

describe("resolveHomePaidPlacementPolicySummary", () => {
  function homePolicy(max: number | null, enabled: boolean): StoresCompositionSectionContract[] {
    return [
      {
        surface: "home",
        slot: "homePaidAdInsertion",
        contentType: "ad",
        enabled,
        order: 0,
        interval: { consumed: false, reason: "NOT_CONSUMED" },
        max,
        titleAuthority: "none",
      },
    ];
  }

  it("reads enabled/max/interval from runtime helpers (not UI literals)", () => {
    const withRest = resolveHomePaidPlacementPolicySummary({
      compositionRows: homePolicy(3, false),
      restShelfAdIntegration: "badge",
    });
    expect(withRest.enabled).toBe(true);
    expect(withRest.max).toBe(3);
    expect(withRest.intervalEveryN).toBe(STORES_INSERTION_DEFAULT_INTERVAL);

    const compositionOnly = resolveHomePaidPlacementPolicySummary({
      compositionRows: homePolicy(null, true),
      restShelfAdIntegration: "off",
    });
    expect(compositionOnly.enabled).toBe(true);
    expect(compositionOnly.max).toBe(5);
    expect(compositionOnly.intervalEveryN).toBe(STORES_INSERTION_DEFAULT_INTERVAL);

    const off = resolveHomePaidPlacementPolicySummary({
      compositionRows: homePolicy(5, false),
      restShelfAdIntegration: "off",
    });
    expect(off.enabled).toBe(false);
  });
});
