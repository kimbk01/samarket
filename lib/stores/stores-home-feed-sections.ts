import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

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
  etaLabel: string | null;
  rating: number;
  deliveryFeeLabel?: string | null;
  deliveryFeeStrikePhp?: number | null;
  discountEvidence?: StoresHomeFoodDiscountEvidence | null;
  menuAuthority?: StoresHomeMenuAuthority;
};

/** 가로 음식 레일 — 매장별 첫 featured 메뉴 (composer 외 legacy flatten 전용) */
export function flattenStoresHomeFoodEntries(
  stores: StoreHomeFeedItem[],
  max = 24
): StoresHomeFoodEntry[] {
  const out: StoresHomeFoodEntry[] = [];
  for (const s of stores) {
    if (out.length >= max) break;
    const item = s.featuredItems[0];
    if (!item) continue;
    out.push({
      storeId: s.id,
      storeSlug: s.slug,
      storeName: s.nameKo,
      productId: item.productId,
      name: item.name,
      price: item.price,
      imageUrl: item.imageUrl?.trim() || null,
      etaLabel: s.etaLabel ?? null,
      rating: s.rating,
      deliveryFeeLabel: s.deliveryFeeLabel?.trim() || null,
      deliveryFeeStrikePhp: s.deliveryFeeStrikePhp ?? null,
      discountEvidence:
        s.deliveryFeeStrikePhp != null && Number(s.deliveryFeeStrikePhp) > 0 ?
          "delivery_fee_strike"
        : null,
    });
  }
  return out;
}

/** 동네 ETA 요약 — location bar 보조 */
export function summarizeHomeFeedEta(stores: StoreHomeFeedItem[]): string | null {
  const open = stores.filter((s) => s.status === "open" && s.deliveryAvailable);
  const sample = open[0]?.etaLabel?.trim();
  return sample || null;
}
