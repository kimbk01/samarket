/**
 * Product recovery contract — SEARCH not sellable; Cash separate; browse target match.
 */
import { describe, expect, it } from "vitest";
import {
  browseTargetMatchesCustomerScope,
  DELIVERY_AD_PRODUCT_RECOVERY,
  STORES_SEARCH_TOP_LAUNCH,
  assertDeliveryAdCashChargeAmountMajor,
} from "@/lib/stores/advertising/delivery-ad-product-recovery-contract";
import {
  LAUNCH_BANNER_INVENTORY_KEYS,
  isLaunchSellableInventoryKey,
} from "@/lib/stores/advertising/delivery-ad-launch-placement-product";
import { OWNER_BANNER_INVENTORY_KEYS } from "@/lib/stores/advertising/owner-banner-contract";
import { DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT } from "@/lib/stores/advertising/delivery-ad-commercial-contract";

describe("delivery-ad product recovery", () => {
  it("locks money + SEARCH launch verdict", () => {
    expect(DELIVERY_AD_PRODUCT_RECOVERY.canonicalAdsDebitSource).toBe("STORE_CASH");
    expect(DELIVERY_AD_PRODUCT_RECOVERY.paymentModel).toBe("DEBIT_REFUND");
    expect(DELIVERY_AD_PRODUCT_RECOVERY.legacyBusinessCash).toBe("MIGRATION_SOURCE");
    expect(DELIVERY_AD_PRODUCT_RECOVERY.creditToCashTransfer).toBe(false);
    expect(STORES_SEARCH_TOP_LAUNCH.launchStatus).toBe("NOT_SELLABLE");
    expect(isLaunchSellableInventoryKey("STORES_SEARCH_TOP")).toBe(false);
    expect(LAUNCH_BANNER_INVENTORY_KEYS).toEqual(["STORES_HOME_HERO"]);
    expect(OWNER_BANNER_INVENTORY_KEYS).toEqual(["STORES_HOME_HERO"]);
    expect(DELIVERY_AD_COMMERCIAL_INVENTORY_BY_PRODUCT.banner).toEqual([
      "STORES_HOME_HERO",
    ]);
  });

  it("browse target matches 1st vs 2nd customer scope", () => {
    expect(
      browseTargetMatchesCustomerScope({
        browseTargetKind: "primary",
        browsePrimarySlug: "restaurant",
        browseSecondarySlug: null,
        customerPrimarySlug: "restaurant",
        customerSubSlug: null,
      })
    ).toBe(true);
    expect(
      browseTargetMatchesCustomerScope({
        browseTargetKind: "primary",
        browsePrimarySlug: "restaurant",
        browseSecondarySlug: null,
        customerPrimarySlug: "restaurant",
        customerSubSlug: "korean",
      })
    ).toBe(false);
    expect(
      browseTargetMatchesCustomerScope({
        browseTargetKind: "secondary",
        browsePrimarySlug: "restaurant",
        browseSecondarySlug: "korean",
        customerPrimarySlug: "restaurant",
        customerSubSlug: "korean",
      })
    ).toBe(true);
  });

  it("cash charge amount bounds", () => {
    expect(assertDeliveryAdCashChargeAmountMajor(500)).toBe(true);
    expect(assertDeliveryAdCashChargeAmountMajor(50)).toBe(false);
  });
});
