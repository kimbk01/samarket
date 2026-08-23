import { describe, expect, it } from "vitest";
import { resolveStoreListCardBadges } from "@/lib/stores/presentation/resolve-store-list-card-badges";

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
});
