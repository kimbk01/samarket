import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { storeToHomeFoodEntry } from "@/lib/stores/stores-home-food-entry";

export type StoresHomeFeedSections = {
  openNow: StoreHomeFeedItem[];
  popularStores: StoreHomeFeedItem[];
  premium: StoreHomeFeedItem[];
  topRated: StoreHomeFeedItem[];
  discounted: StoreHomeFeedItem[];
  nearby: StoreHomeFeedItem[];
  feedRest: StoreHomeFeedItem[];
};

/** CUT3 — 실제 evidence 타입만. 임의 합치기 금지. */
export type StoresHomeFoodDiscountEvidence = "delivery_fee_strike";

/** P1-B2 — Slot2 menu authority (minimal set for HOME wiring) */
export type StoresHomeMenuAuthority = "platform_popular" | "owner_representative";

export type StoresHomeFoodEntry = {
  storeId: string;
  storeSlug: string;
  storeName: string;
  productId: string;
  name: string;
  price: number;
  /** home-feed featuredItems[].imageUrl — 레일 즉시 썸네일 */
  imageUrl: string | null;
  /** 매장 프로필 사진 — 선반 이미지 소스 「매장 프로필」·「브랜드 로고」 */
  storeProfileImageUrl?: string | null;
  etaLabel: string | null;
  rating: number;
  deliveryFeeLabel?: string | null;
  deliveryFeeStrikePhp?: number | null;
  discountEvidence?: StoresHomeFoodDiscountEvidence | null;
  menuAuthority?: StoresHomeMenuAuthority;
  /** P1-D B2 — campaign copy only (not popular/discount/featured) */
  campaignTitle?: string | null;
  campaignType?: "event" | "promo" | null;
  /** CUT 10 — from home-feed serviceability (no client distance math) */
  distanceOutOfRange?: boolean;
  maxDeliveryDistanceKm?: number | null;
  /** 배달 샘플 — 홈 카드가 주문 불가 표시로 바꾼다 (`store_kind = sample`) */
  isSample?: boolean;
};


/** 가로 음식 레일 — 매장별 첫 featured 메뉴 (카드 필드는 단일 매퍼 `storeToHomeFoodEntry`) */
export function flattenStoresHomeFoodEntries(
  stores: StoreHomeFeedItem[],
  max = 24
): StoresHomeFoodEntry[] {
  const out: StoresHomeFoodEntry[] = [];
  for (const s of stores) {
    if (out.length >= max) break;
    const item = s.featuredItems[0];
    if (!item) continue;
    out.push(storeToHomeFoodEntry(s, item));
  }
  return out;
}

/** 동네 ETA 요약 — location bar 보조 */
export function summarizeHomeFeedEta(stores: StoreHomeFeedItem[]): string | null {
  const open = stores.filter((s) => s.status === "open" && s.deliveryAvailable);
  const sample = open[0]?.etaLabel?.trim();
  return sample || null;
}
