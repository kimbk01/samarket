import { describe, expect, it } from "vitest";
import { buildBrowseCategoryPromoLine } from "@/lib/stores/build-browse-category-promo-line";
import type { BrowseStoreRowLabels } from "@/lib/stores/browse-store-row-labels";
import type { BrowseStoreCommerceSnapshot } from "@/lib/stores/browse-store-commerce-snapshot";

const baseCommerce: BrowseStoreCommerceSnapshot = {
  minOrderPhp: 200,
  deliveryFeePhp: 50,
  deliveryFeeMode: "self",
  deliveryFeeStrikeReferencePhp: null,
  freeDeliveryOverPhp: null,
  deliveryCourierLabel: null,
  prepMinutes: 30,
  estPrepLabel: "30 min",
  deliveryRideDisplayManual: null,
  paymentMethodsConfig: null,
  paymentMethodsLegacy: null,
};

const baseLabels: BrowseStoreRowLabels = {
  deliveryFeeLabel: "₱50 delivery",
  deliveryFeeStrikePhp: null,
  etaLabel: "Approx. 30 min",
  paymentMethodsLine: "GCash",
  minOrderLabel: "Min. order ₱200",
};

describe("buildBrowseCategoryPromoLine", () => {
  it("returns null when delivery unavailable", () => {
    expect(
      buildBrowseCategoryPromoLine("en", baseCommerce, baseLabels, { deliveryAvailable: false })
    ).toBeNull();
  });

  it("returns null for standard paid delivery without promo authority", () => {
    expect(
      buildBrowseCategoryPromoLine("en", baseCommerce, baseLabels, { deliveryAvailable: true })
    ).toBeNull();
  });

  it("returns promo line for self_free_promo with strike reference", () => {
    const commerce: BrowseStoreCommerceSnapshot = {
      ...baseCommerce,
      deliveryFeeMode: "self_free_promo",
      deliveryFeeStrikeReferencePhp: 2500,
    };
    const labels: BrowseStoreRowLabels = {
      ...baseLabels,
      deliveryFeeLabel: "Free delivery applied",
      deliveryFeeStrikePhp: 2500,
    };
    const line = buildBrowseCategoryPromoLine("en", commerce, labels, { deliveryAvailable: true });
    expect(line).toContain("Free delivery applied");
    expect(line).toContain("₱2,500");
  });

  it("returns threshold-free line when commerce proves free-over threshold", () => {
    const commerce: BrowseStoreCommerceSnapshot = {
      ...baseCommerce,
      deliveryFeePhp: 0,
      freeDeliveryOverPhp: 500,
    };
    const line = buildBrowseCategoryPromoLine("en", commerce, baseLabels, { deliveryAvailable: true });
    expect(line).toBeTruthy();
    expect(line).not.toContain("Instant");
  });
});
