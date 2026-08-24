"use client";

import type { BrowseFeaturedCardItem } from "@/lib/stores/browse-featured-items-types";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import type { StoresHomeShelfCardBenefit } from "@/lib/stores/product/stores-home-shelf-card-benefit";
import {
  StoresHomeFoodRailCard,
  type StoresHomeFoodRailPresentation,
} from "@/components/stores/home/presentation/StoresHomeFoodRailCard";

export { deliveryStoreMenusPrewarm } from "@/lib/dibay/delivery-store-menus-prewarm";

export type { StoresHomeFoodRailPresentation };

export type StoresHomeFoodCardProps = {
  entry: StoresHomeFoodEntry;
  imageUrl: string | null;
  loadingImage: boolean;
  markStoreCardPerf?: boolean;
  presentation?: StoresHomeFoodRailPresentation;
  benefit?: StoresHomeShelfCardBenefit;
};

/** Hub food card — delegates to `StoresHomeFoodRailCard` (§3.6). */
export function StoresHomeFoodCard(props: StoresHomeFoodCardProps) {
  return <StoresHomeFoodRailCard {...props} />;
}

export function resolveFoodCardImage(
  entry: StoresHomeFoodEntry,
  hydrated: BrowseFeaturedCardItem[] | undefined
): { imageUrl: string | null; loading: boolean } {
  if (entry.imageUrl) return { imageUrl: entry.imageUrl, loading: false };
  if (hydrated === undefined) return { imageUrl: null, loading: true };
  const hit = hydrated.find((x) => x.productId === entry.productId);
  if (hit?.imageUrl) return { imageUrl: hit.imageUrl, loading: false };
  const fallback = hydrated.find((x) => x.imageUrl)?.imageUrl ?? null;
  return { imageUrl: fallback, loading: false };
}
