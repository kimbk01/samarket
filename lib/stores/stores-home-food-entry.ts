/**
 * 홈 매장 → 선반 카드 entry 단일 매퍼 (음식·매장 카드 공용).
 * 카드 필드(샘플 배지·프로필 사진·범위 밖·혜택 근거)를 한 곳에서 채워 매퍼별 누락을 막는다.
 */
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoresHomeFoodEntry } from "@/lib/stores/stores-home-feed-sections";

export type StoresHomeEntryProduct = {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string | null;
};

function resolveDeliveryFeeStrikeEvidence(store: StoreHomeFeedItem): StoresHomeFoodEntry["discountEvidence"] {
  const strike = store.deliveryFeeStrikePhp;
  return strike != null && Number.isFinite(Number(strike)) && Number(strike) > 0 ? "delivery_fee_strike" : null;
}

export function storeToHomeFoodEntry(
  store: StoreHomeFeedItem,
  product: StoresHomeEntryProduct,
  menuAuthority: NonNullable<StoresHomeFoodEntry["menuAuthority"]> = "owner_representative"
): StoresHomeFoodEntry {
  return {
    storeId: store.id,
    storeSlug: store.slug,
    storeName: store.nameKo,
    productId: product.productId,
    name: product.name,
    price: product.price,
    imageUrl: product.imageUrl?.trim() || null,
    storeProfileImageUrl: store.profileImageUrl?.trim() || null,
    etaLabel: store.etaLabel?.trim() || null,
    rating: store.rating,
    deliveryFeeLabel: store.deliveryFeeLabel?.trim() || null,
    deliveryFeeStrikePhp: store.deliveryFeeStrikePhp ?? null,
    discountEvidence: resolveDeliveryFeeStrikeEvidence(store),
    menuAuthority,
    distanceOutOfRange: store.distanceOutOfRange === true,
    maxDeliveryDistanceKm: store.maxDeliveryDistanceKm ?? null,
    isSample: store.isSample === true,
  };
}

/** 대표 메뉴(오너 지정 첫 featured) entry — 없으면 null */
export function buildRepresentativeFoodEntry(store: StoreHomeFeedItem): StoresHomeFoodEntry | null {
  const item = store.featuredItems[0];
  if (!item?.productId) return null;
  return storeToHomeFoodEntry(store, item, "owner_representative");
}

/** 인기 선반 — 플랫폼 인기 상품이 있으면 그것, 없으면 대표 메뉴 */
export function buildPopularFoodEntry(store: StoreHomeFeedItem): StoresHomeFoodEntry | null {
  const platform = store.platformPopularProducts?.[0];
  if (platform?.productId) return storeToHomeFoodEntry(store, platform, "platform_popular");
  return buildRepresentativeFoodEntry(store);
}
