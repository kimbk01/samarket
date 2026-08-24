/**
 * HOME shelf card image source resolution.
 */

import type { StoresHomeShelfImageSource } from "@/lib/stores/product/stores-home-shelf-product-config";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

export function resolveHomeShelfFoodEntryImage(
  entry: StoresHomeFoodEntry,
  hydrated: BrowseFeaturedCardItem[] | undefined,
  imageSource: StoresHomeShelfImageSource,
  campaignImageUrl?: string | null
): { imageUrl: string | null; loading: boolean } {
  const productFromEntry = entry.imageUrl?.trim() || null;
  const productFromHydrated =
    hydrated?.find((x) => x.productId === entry.productId)?.imageUrl?.trim() ||
    hydrated?.find((x) => x.imageUrl)?.imageUrl?.trim() ||
    null;

  switch (imageSource) {
    case "representative_product":
      if (productFromEntry) return { imageUrl: productFromEntry, loading: false };
      if (hydrated === undefined) return { imageUrl: null, loading: true };
      return { imageUrl: productFromHydrated, loading: false };
    case "campaign_creative":
      if (campaignImageUrl?.trim()) return { imageUrl: campaignImageUrl.trim(), loading: false };
      if (productFromEntry) return { imageUrl: productFromEntry, loading: false };
      if (hydrated === undefined) return { imageUrl: null, loading: true };
      return { imageUrl: productFromHydrated, loading: false };
    case "brand_logo":
    case "store_profile":
      if (productFromEntry) return { imageUrl: productFromEntry, loading: false };
      if (hydrated === undefined) return { imageUrl: null, loading: true };
      return { imageUrl: productFromHydrated, loading: false };
    case "auto":
    default:
      if (productFromEntry) return { imageUrl: productFromEntry, loading: false };
      if (hydrated === undefined) return { imageUrl: null, loading: true };
      return { imageUrl: productFromHydrated, loading: false };
  }
}

export function resolveHomeShelfStoreImage(
  store: StoreHomeFeedItem,
  imageSource: StoresHomeShelfImageSource
): string | null {
  const profile = store.profileImageUrl?.trim() || null;
  const product =
    store.featuredItems.find((x) => x.imageUrl?.trim())?.imageUrl?.trim() || null;
  switch (imageSource) {
    case "store_profile":
      return profile || product;
    case "representative_product":
      return product || profile;
    case "brand_logo":
      return profile || product;
    case "campaign_creative":
      return product || profile;
    case "auto":
    default:
      return profile || product;
  }
}
