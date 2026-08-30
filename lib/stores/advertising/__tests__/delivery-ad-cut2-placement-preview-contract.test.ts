/**
 * PRODUCT CUT 2 — Canonical Placement Preview contracts.
 */
import { describe, expect, it } from "vitest";
import {
  assertPlacementPreviewNoExposureToken,
  buildPolicySlotMarkerSequence,
  DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT,
  isBlockedDetailInventoryPreview,
  placementPreviewSupportsProduct,
} from "@/lib/stores/advertising/delivery-ad-placement-preview";
import { resolveHomePaidPlacementPolicySummary } from "@/lib/stores/advertising/delivery-ad-home-placement-policy";
import { STORES_INSERTION_DEFAULT_INTERVAL } from "@/lib/stores/composition/stores-composition-insertion-live";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";
import { surfacePolicyForInventory } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";
import type { DeliveryAdPlacementPreviewPayload } from "@/lib/stores/advertising/load-delivery-ad-placement-preview-bundle";

describe("DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT", () => {
  it("locks visual owners to customer renderers", () => {
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.visualOwners.STORES_HOME_FEED).toBe(
      "StoresHomeTimesaleRowCard"
    );
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.visualOwners.STORES_CATEGORY_FEED).toBe(
      "StoreBrowseCategoryRowCard"
    );
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.visualOwners.STORES_HOME_HERO).toBe(
      "DeliveryAdBanner"
    );
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.visualOwners.STORES_SEARCH_TOP).toBe(
      "DeliveryAdBanner"
    );
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.detailInventoryPreview).toBe("NONE");
  });

  it("forbids preview telemetry", () => {
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.telemetry.owner_preview.exposureToken).toBe(
      false
    );
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.telemetry.owner_preview.impression).toBe(false);
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.telemetry.owner_preview.click).toBe(false);
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.telemetry.admin_preview.exposureToken).toBe(
      false
    );
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.telemetry.admin_preview.impression).toBe(false);
    expect(DELIVERY_AD_PLACEMENT_PREVIEW_CONTRACT.telemetry.admin_preview.click).toBe(false);
  });
});

describe("assertPlacementPreviewNoExposureToken", () => {
  it("rejects any exposure token in preview contexts", () => {
    expect(assertPlacementPreviewNoExposureToken("owner_preview", null).ok).toBe(true);
    expect(assertPlacementPreviewNoExposureToken("admin_preview", "").ok).toBe(true);
    expect(assertPlacementPreviewNoExposureToken("owner_preview", "tok_abc").ok).toBe(false);
    expect(assertPlacementPreviewNoExposureToken("admin_preview", "x").ok).toBe(false);
  });
});

describe("placementPreviewSupportsProduct", () => {
  it("maps store sponsored and banner inventories only", () => {
    expect(placementPreviewSupportsProduct("store_sponsored", "STORES_HOME_FEED")).toBe(true);
    expect(placementPreviewSupportsProduct("store_sponsored", "STORES_CATEGORY_FEED")).toBe(true);
    expect(placementPreviewSupportsProduct("store_sponsored", "STORES_SEARCH_TOP")).toBe(false);
    expect(placementPreviewSupportsProduct("banner", "STORES_HOME_HERO")).toBe(true);
    expect(placementPreviewSupportsProduct("banner", "STORES_SEARCH_TOP")).toBe(true);
    expect(placementPreviewSupportsProduct("banner", "STORES_HOME_FEED")).toBe(false);
  });

  it("blocks detail inventory preview", () => {
    expect(isBlockedDetailInventoryPreview("STORE_DETAIL_RECOMMENDATION_BANNER")).toBe(true);
    expect(placementPreviewSupportsProduct("banner", "STORE_DETAIL_RECOMMENDATION_BANNER")).toBe(
      false
    );
  });
});

describe("buildPolicySlotMarkerSequence", () => {
  it("uses resolved interval/max without hardcoded literals in callers", () => {
    const summary = resolveHomePaidPlacementPolicySummary({
      compositionRows: [
        {
          surface: "home",
          slot: "homePaidAdInsertion",
          contentType: "ad",
          enabled: true,
          order: 0,
          interval: { consumed: false, reason: "NOT_CONSUMED" },
          max: 3,
          titleAuthority: "none",
        },
      ] as StoresCompositionSectionContract[],
      restShelfAdIntegration: "store_paid_ad",
    });
    expect(summary.intervalEveryN).toBe(STORES_INSERTION_DEFAULT_INTERVAL);
    const seq = buildPolicySlotMarkerSequence({
      intervalEveryN: summary.intervalEveryN,
      maxInsertion: summary.max,
    });
    expect(seq.filter((m) => m === "organic").length).toBeGreaterThan(0);
    expect(seq).toContain("ad_slot");
  });

  it("shows organic-only markers when max is 0 (disabled insertion capacity)", () => {
    const seq = buildPolicySlotMarkerSequence({ intervalEveryN: 4, maxInsertion: 0 });
    expect(seq.every((m) => m === "organic")).toBe(true);
  });
});

describe("surfacePolicyForInventory", () => {
  const payload: DeliveryAdPlacementPreviewPayload = {
    store: null,
    storeLoadError: true,
    eligibilityWarning: false,
    storeName: null,
    taxonomy: {
      primarySlug: "restaurant",
      primaryLabel: "식당",
      subSlug: "korean",
      subLabel: "한식",
    },
    home: { enabled: true, intervalEveryN: 8, maxInsertion: 5 },
    browse: { enabled: false, intervalEveryN: 6, maxInsertion: 1 },
  };

  it("reads HOME/BROWSE from resolved payload (disabled browse preserved)", () => {
    expect(surfacePolicyForInventory(payload, "STORES_HOME_FEED")).toEqual(payload.home);
    expect(surfacePolicyForInventory(payload, "STORES_CATEGORY_FEED")).toEqual(payload.browse);
    expect(surfacePolicyForInventory(payload, "STORES_CATEGORY_FEED")?.enabled).toBe(false);
    expect(surfacePolicyForInventory(payload, "STORES_SEARCH_TOP").enabled).toBe(true);
  });
});
