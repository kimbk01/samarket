/**
 * 매장 메뉴 화면의 배달/포장 선택 → 장바구니 초기 수령 방식과 맞추기 위한 sessionStorage.
 */
export type StoreFulfillmentPref = "pickup" | "local_delivery";

/** 스티키 헤더 ↔ `StoreDetailPublic` 등 동기화 */
export const STORE_FULFILLMENT_PREF_CHANGED_EVENT = "samarket:store-fulfillment-changed";

export type StoreFulfillmentPrefChangedDetail = { slug: string; mode: StoreFulfillmentPref };

export function storeFulfillmentPrefKey(slug: string): string {
  return `samarket:store-fulfillment:${slug.trim()}`;
}

export function readStoreFulfillmentPref(slug: string): StoreFulfillmentPref | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(storeFulfillmentPrefKey(slug));
    if (v === "local_delivery" || v === "pickup") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function dispatchFulfillmentChanged(slug: string, mode: StoreFulfillmentPref): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<StoreFulfillmentPrefChangedDetail>(STORE_FULFILLMENT_PREF_CHANGED_EVENT, {
        detail: { slug: slug.trim(), mode },
      })
    );
  } catch {
    /* ignore */
  }
}

export function writeStoreFulfillmentPref(slug: string, mode: StoreFulfillmentPref): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storeFulfillmentPrefKey(slug), mode);
  } catch {
    /* ignore */
  }
  dispatchFulfillmentChanged(slug, mode);
}
