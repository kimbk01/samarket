/**
 * Recovery P1 — launch placement human-language contract.
 */
import { describe, expect, it } from "vitest";
import {
  assertLaunchSellableInventory,
  isFutureDeliveryAdInventoryKey,
  isLaunchSellableInventoryKey,
  LAUNCH_BANNER_INVENTORY_KEYS,
  LAUNCH_STORE_PROMOTION_INVENTORY_KEYS,
  looksLikeInternalInventoryKey,
  ownerCategoryPlacementTitle,
} from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS } from "@/lib/stores/advertising/delivery-ad-commercial-labels";
import { FUTURE_DELIVERY_AD_INVENTORY_KEYS } from "@/lib/stores/advertising/delivery-ad-inventory";
import {
  ownerCampaignMayCancelApplication,
  ownerCampaignMayDeleteDraft,
  ownerCampaignHubPrimaryCta,
} from "@/lib/stores/advertising/owner-campaign-action-policy";

describe("delivery-ad-launch-placement-product P1", () => {
  it("launch store + banner inventories only; FUTURE not sellable", () => {
    expect(LAUNCH_STORE_PROMOTION_INVENTORY_KEYS).toEqual([
      "STORES_HOME_FEED",
      "STORES_CATEGORY_FEED",
    ]);
    expect(LAUNCH_BANNER_INVENTORY_KEYS).toEqual([
      "STORES_HOME_HERO",
      "STORES_SEARCH_TOP",
    ]);
    for (const k of FUTURE_DELIVERY_AD_INVENTORY_KEYS) {
      expect(isFutureDeliveryAdInventoryKey(k)).toBe(true);
      expect(isLaunchSellableInventoryKey(k)).toBe(false);
      expect(assertLaunchSellableInventory(k)).toBe(false);
    }
  });

  it("commercial labels are human language without inventory keys", () => {
    for (const [key, labels] of Object.entries(DELIVERY_AD_COMMERCIAL_PLACEMENT_LABELS)) {
      expect(looksLikeInternalInventoryKey(key)).toBe(true);
      expect(looksLikeInternalInventoryKey(labels.ko)).toBe(false);
      expect(looksLikeInternalInventoryKey(labels.en)).toBe(false);
    }
  });

  it("category title uses store taxonomy label", () => {
    expect(
      ownerCategoryPlacementTitle({
        primaryCategoryLabel: "한식",
        fallbackKo: "업종 매장 광고",
        fallbackEn: "Category store ads",
        lang: "ko",
      })
    ).toBe("한식 매장 광고");
  });

  it("action matrix: DRAFT delete yes; cancel after submit no; ACTIVE no delete", () => {
    expect(ownerCampaignMayDeleteDraft("DRAFT")).toBe(true);
    expect(ownerCampaignMayDeleteDraft("ACTIVE")).toBe(false);
    expect(ownerCampaignMayCancelApplication("SUBMITTED")).toBe(false);
    expect(
      ownerCampaignHubPrimaryCta({
        lifecycleStatus: "DRAFT",
        productKind: "store_sponsored",
        storeId: "s1",
        campaignId: "c1",
      }).labelKey
    ).toBe("owner_ads_hub_cta_continue_draft");
    expect(
      ownerCampaignHubPrimaryCta({
        lifecycleStatus: "ACTIVE",
        productKind: "store_sponsored",
        storeId: "s1",
        campaignId: "c1",
      }).labelKey
    ).toBe("owner_ads_hub_cta_manage_active");
  });
});
