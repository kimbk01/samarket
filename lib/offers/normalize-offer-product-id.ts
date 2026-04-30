/** 구매자 제안 성공 시 판매자 목록·다른 탭이 같은 상품 기준으로 다시 불러오게 할 때 사용 */
export const PRICE_OFFERS_CHANGED_EVENT = "samarket:price-offers-changed" as const;

const BUMP_STORAGE_PREFIX = "samarket:price-offers-bump:";

/** `posts.id` / `price_offers.product_id` — 클라이언트·서버 공통 UUID 정규화 */
export function normalizeOfferProductId(raw: unknown): string {
  const t =
    typeof raw === "string"
      ? raw.trim()
      : raw != null && String(raw).trim() !== ""
        ? String(raw).trim()
        : "";
  if (!t) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) {
    return t.toLowerCase();
  }
  return t;
}

export function priceOffersBumpStorageKey(productId: string): string {
  return `${BUMP_STORAGE_PREFIX}${normalizeOfferProductId(productId)}`;
}

/** 클라이언트 전용 — 구매자 제안 성공 직후 한 번 호출 */
export function broadcastPriceOfferCreatedForProduct(rawPostId: string): void {
  const pid = normalizeOfferProductId(rawPostId);
  if (!pid || typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(PRICE_OFFERS_CHANGED_EVENT, { detail: { productId: pid } }));
    localStorage.setItem(priceOffersBumpStorageKey(pid), String(Date.now()));
  } catch {
    /* 사생활 보호 모드·저장소 거부 */
  }
}
