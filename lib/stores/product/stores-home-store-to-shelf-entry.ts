import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { resolveHomeShelfStoreImage } from "@/lib/stores/product/stores-home-shelf-image-resolve";
import type { StoresHomeShelfImageSource } from "@/lib/stores/product/stores-home-shelf-product-config";

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

export function resolveStoreShelfCardImageUrl(
  store: StoreHomeFeedItem,
  imageSource: StoresHomeShelfImageSource = "auto"
): string | null {
  return resolveHomeShelfStoreImage(store, imageSource);
}
