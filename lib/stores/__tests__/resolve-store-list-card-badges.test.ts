import { describe, expect, it } from "vitest";
import {
  formatStoreCardOutOfRangeLabel,
  resolveStoreListCardBadges,
} from "@/lib/stores/presentation/resolve-store-list-card-badges";

describe("resolveStoreListCardBadges", () => {
  it("maps isFeatured to recommended only (not instant discount)", () => {
    const badges = resolveStoreListCardBadges({
      statusLabel: "Open",
      statusClassName: "bg-sam-success-soft",
      isFeatured: true,
      recommendedLabel: "Recommended",
      pickupAvailable: false,
      pickupLabel: "Pickup",
      freeDeliveryProven: false,
      freeDeliveryLabel: "Free delivery",
      outOfRangeLabel: null,
    });
    expect(badges.some((b) => b.kind === "recommended" && b.label === "Recommended")).toBe(true);
    expect(badges.some((b) => b.label.toLowerCase().includes("instant"))).toBe(false);
  });

  it("includes pickup when pickupAvailable is true", () => {
    const badges = resolveStoreListCardBadges({
      statusLabel: "Open",
      statusClassName: "bg-sam-success-soft",
      isFeatured: false,
      recommendedLabel: "Recommended",
      pickupAvailable: true,
      pickupLabel: "Pickup available",
      freeDeliveryProven: false,
      freeDeliveryLabel: "Free delivery",
      outOfRangeLabel: null,
    });
    expect(badges.some((b) => b.kind === "pickup")).toBe(true);
  });

  it("CUT9: OOR suppresses free_delivery and includes out_of_range", () => {
    const badges = resolveStoreListCardBadges({
      statusLabel: "Open",
      statusClassName: "bg-sam-success-soft",
      isFeatured: false,
      recommendedLabel: "Recommended",
      pickupAvailable: true,
      pickupLabel: "Pickup",
      freeDeliveryProven: true,
      freeDeliveryLabel: "Free delivery",
      outOfRangeLabel: "거리 초과",
    });
    expect(badges.some((b) => b.kind === "free_delivery")).toBe(false);
    expect(badges.some((b) => b.kind === "out_of_range" && b.label === "거리 초과")).toBe(true);
    expect(badges.some((b) => b.kind === "pickup")).toBe(true);
  });

  it("CUT9: serviceable keeps free_delivery when proven", () => {
    const badges = resolveStoreListCardBadges({
      statusLabel: "Open",
      statusClassName: "bg-sam-success-soft",
      isFeatured: false,
      recommendedLabel: "Recommended",
      pickupAvailable: false,
      pickupLabel: "Pickup",
      freeDeliveryProven: true,
      freeDeliveryLabel: "Free delivery",
      outOfRangeLabel: null,
    });
    expect(badges.some((b) => b.kind === "free_delivery")).toBe(true);
    expect(badges.some((b) => b.kind === "out_of_range")).toBe(false);
  });
});

describe("formatStoreCardOutOfRangeLabel", () => {
  it("returns null when in range", () => {
    expect(
      formatStoreCardOutOfRangeLabel({
        distanceOutOfRange: false,
        maxDeliveryDistanceKm: 5,
        labelWithMax: (km) => `${km}km 초과`,
        labelGeneric: "거리 초과",
      })
    ).toBeNull();
  });

  it("uses max km label when OOR and max present", () => {
    expect(
      formatStoreCardOutOfRangeLabel({
        distanceOutOfRange: true,
        maxDeliveryDistanceKm: 3,
        labelWithMax: (km) => `${km}km 초과`,
        labelGeneric: "거리 초과",
      })
    ).toBe("3km 초과");
  });
});
