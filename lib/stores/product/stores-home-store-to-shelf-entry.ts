import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";
import { resolveHomeShelfStoreImage } from "@/lib/stores/product/stores-home-shelf-image-resolve";
import { storeToHomeFoodEntry } from "@/lib/stores/stores-home-food-entry";
import type { StoresHomeShelfImageSource } from "@/lib/stores/product/stores-home-shelf-product-config";

/** Store shelf row → horizontal/teaser card entry (store entity anatomy) — 단일 매퍼 사용 (샘플 배지 등 누락 방지) */
export function storeHomeFeedItemToShelfEntry(store: StoreHomeFeedItem): StoresHomeFoodEntry {
  const feat = store.featuredItems[0];
  return storeToHomeFoodEntry(store, {
    productId: feat?.productId ?? store.id,
    name: feat?.name ?? store.nameKo,
    price: feat?.price ?? 0,
    imageUrl: store.profileImageUrl ?? feat?.imageUrl ?? null,
  });
}

export function resolveStoreShelfCardImageUrl(
  store: StoreHomeFeedItem,
  imageSource: StoresHomeShelfImageSource = "auto"
): string | null {
  return resolveHomeShelfStoreImage(store, imageSource);
}
