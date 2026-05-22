import { describe, expect, it } from "vitest";
import { mergeFeaturedHydrationIntoStoreRowCard } from "@/lib/stores/merge-store-delivery-row-featured-hydration";
import type { StoreRowCardData } from "@/components/stores/home/StoreDeliveryRowCard";

const baseRow: StoreRowCardData = {
  storeId: "s1",
  slug: "test-store",
  nameKo: "Test",
  tagline: null,
  categoryLine: null,
  regionBadge: null,
  status: "open",
  rating: 4.5,
  reviewCount: 1,
  deliveryAvailable: true,
  pickupAvailable: true,
  reservationAvailable: false,
  minOrderLabel: null,
  estPrepLabel: "20분",
  etaLabel: null,
  deliveryFeeLabel: null,
  deliveryFeeStrikePhp: null,
  paymentMethodsLine: "",
  distanceKm: 1,
  routeDistanceKm: null,
  straightDistanceKm: 1,
  menuPreview: "old preview",
  profileImageUrl: null,
  heroBannerImageUrl: null,
  featuredItems: [{ productId: "p0", name: "Old", price: 1, imageUrl: null }],
  isFeatured: false,
  browsePrimarySlug: null,
  commerce: null,
};

describe("mergeFeaturedHydrationIntoStoreRowCard", () => {
  it("hydration 없으면 base 유지", () => {
    expect(mergeFeaturedHydrationIntoStoreRowCard(baseRow, undefined)).toBe(baseRow);
  });

  it("hydration 시 featuredItems·menuPreview 갱신", () => {
    const hydrated = [
      {
        productId: "p1",
        name: "Kimchi",
        price: 120,
        imageUrl: "https://cdn.example/a.jpg",
      },
    ];
    const next = mergeFeaturedHydrationIntoStoreRowCard(baseRow, hydrated);
    expect(next.featuredItems).toEqual(hydrated);
    expect(next.menuPreview).toBe("Kimchi");
    expect(next.nameKo).toBe("Test");
  });
});
