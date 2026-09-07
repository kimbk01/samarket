import { describe, expect, it } from "vitest";
import {
  browseItemToVerticalModel,
  homeFeedItemToVerticalModel,
} from "@/components/stores/home/StoreVerticalDiscoveryCard";
import { flattenStoresHomeFoodEntries } from "@/lib/stores/stores-home-feed-sections";
import { storeHomeFeedItemToShelfEntry } from "@/lib/stores/product/stores-home-store-to-shelf-entry";
import { formatStoreCardOutOfRangeLabel } from "@/lib/stores/presentation/resolve-store-list-card-badges";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { BrowseStoreListItem } from "@/lib/stores/browse-api-types";

function baseHomeItem(over: Partial<StoreHomeFeedItem> = {}): StoreHomeFeedItem {
  return {
    id: "s1",
    slug: "store-a",
    nameKo: "Store A",
    tagline: null,
    primarySlug: "food",
    primaryNameKo: "Food",
    regionLabel: "City",
    status: "open",
    rating: 4.5,
    reviewCount: 10,
    deliveryAvailable: true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "20분",
    prepMinutes: 20,
    rideMinutes: 10,
    etaLabel: "약 30분",
    deliveryFeeLabel: "무료 배달 적용",
    deliveryFeeStrikePhp: 49,
    paymentMethodsLine: "",
    distanceKm: 8,
    distanceOutOfRange: true,
    maxDeliveryDistanceKm: 5,
    featuredItems: [{ productId: "p1", name: "Menu", price: 100, imageUrl: null }],
    profileImageUrl: null,
    isFeatured: false,
    commerce: {} as StoreHomeFeedItem["commerce"],
    ...over,
  };
}

describe("CUT10 home rail OOR data parity", () => {
  it("food flatten preserves distanceOutOfRange from home-feed", () => {
    const entries = flattenStoresHomeFoodEntries([baseHomeItem()]);
    expect(entries[0]?.distanceOutOfRange).toBe(true);
    expect(entries[0]?.maxDeliveryDistanceKm).toBe(5);
  });

  it("shelf entry mapper preserves OOR fields", () => {
    const entry = storeHomeFeedItemToShelfEntry(baseHomeItem());
    expect(entry.distanceOutOfRange).toBe(true);
    expect(entry.maxDeliveryDistanceKm).toBe(5);
  });

  it("vertical home mapper preserves OOR (was drop point)", () => {
    const model = homeFeedItemToVerticalModel(baseHomeItem());
    expect(model.distanceOutOfRange).toBe(true);
    expect(model.maxDeliveryDistanceKm).toBe(5);
  });

  it("vertical browse mapper preserves OOR", () => {
    const browse = {
      slug: "store-a",
      nameKo: "Store A",
      tagline: null,
      primaryNameKo: "Food",
      subNameKo: "Sub",
      regionLabel: "City",
      status: "open",
      rating: 4,
      reviewCount: 1,
      deliveryAvailable: true,
      pickupAvailable: false,
      visitAvailable: true,
      featuredItems: [],
      profileImageUrl: null,
      heroBannerImageUrl: null,
      isFeatured: false,
      estPrepLabel: "15분",
      etaLabel: "약 25분",
      deliveryFeeLabel: "무료 배달 적용",
      deliveryFeeStrikePhp: null,
      paymentMethodsLine: "",
      distanceKm: 9,
      distanceOutOfRange: true,
      maxDeliveryDistanceKm: 3,
    } as unknown as BrowseStoreListItem;
    const model = browseItemToVerticalModel(browse);
    expect(model.distanceOutOfRange).toBe(true);
    expect(model.maxDeliveryDistanceKm).toBe(3);
  });

  it("CUT9 format helper yields OOR meta for rails", () => {
    const label = formatStoreCardOutOfRangeLabel({
      distanceOutOfRange: true,
      maxDeliveryDistanceKm: 5,
      labelWithMax: (km) => `${km}km 초과`,
      labelGeneric: "거리 초과",
    });
    expect(label).toBe("5km 초과");
  });
});
