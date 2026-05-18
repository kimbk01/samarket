/** 배달 매장 장바구니 — TTL·replace 플래그만 (UI 문구는 `store-commerce-ui` 카탈로그). */

/** 기본 24시간 — `STORE_CART_TTL_MS` env 로 덮어쓸 수 있음 */
export const STORE_CART_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function storeCartTtlMs(): number {
  const raw = process.env.NEXT_PUBLIC_STORE_CART_TTL_MS;
  if (raw == null || raw === "") return STORE_CART_DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : STORE_CART_DEFAULT_TTL_MS;
}

/** 클라이언트 `replaceWithLine` ≡ 서버 `replace=true` add-to-cart (로컬 장바구니 전용) */
export const STORE_CART_REPLACE_FLAG = "replace" as const;
