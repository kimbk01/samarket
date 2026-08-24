import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";

/** Store shelf row → horizontal/teaser card entry (store entity anatomy). */
export function storeHomeFeedItemToShelfEntry(store: StoreHomeFeedItem): StoresHomeFoodEntry {
  const feat = store.featuredItems[0];
  return {
    storeId: store.id,
    storeSlug: store.slug,
    storeName: store.nameKo,
    productId: feat?.productId ?? store.id,
    name: feat?.name ?? store.nameKo,
    price: feat?.price ?? 0,
    imageUrl: store.profileImageUrl ?? feat?.imageUrl ?? null,
    etaLabel: store.etaLabel,
    rating: store.rating,
    deliveryFeeLabel: store.deliveryFeeLabel,
    deliveryFeeStrikePhp: store.deliveryFeeStrikePhp,
  };
}

export function resolveStoreShelfCardImageUrl(store: StoreHomeFeedItem): string | null {
  return store.profileImageUrl ?? store.featuredItems[0]?.imageUrl ?? null;
}
