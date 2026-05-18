/** 배달 매장 장바구니 — 단일 매장·TTL·충돌 UX 문구 (배민·요기요·쿠팡이츠식) */

/** 기본 24시간 — `STORE_CART_TTL_MS` env 로 덮어쓸 수 있음 */
export const STORE_CART_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export function storeCartTtlMs(): number {
  const raw = process.env.NEXT_PUBLIC_STORE_CART_TTL_MS;
  if (raw == null || raw === "") return STORE_CART_DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : STORE_CART_DEFAULT_TTL_MS;
}

export const STORE_CART_EXPIRED_TOAST = "이전에 담은 장바구니가 오래되어 비웠어요.";

export const STORE_CART_OTHER_STORE_CONFLICT = {
  title: "카트에 다른 가게 메뉴가 있어요",
  singleStoreRule: "카트에는 한 가게 메뉴만 담을 수 있어요.",
  currentCartLabel: "현재 카트",
  pendingAddLabel: "담으려는 메뉴",
  listTotal: "합계",
  viewCart: "카트 보기",
  cancel: "취소",
  confirm: "카트 비우고 담기",
} as const;

export const STORE_CART_CLEAR_CONFIRM = {
  title: "카트를 비울까요?",
  body: "담은 메뉴가 모두 삭제됩니다.",
  confirm: "비우기",
  cancel: "취소",
} as const;

export const STORE_CART_SUMMARY_HINT = "이 가게 메뉴만 함께 주문할 수 있어요.";
export const STORE_CART_PAGE_TITLE = "카트";

/** 클라이언트 `replaceWithLine` ≡ 서버 `replace=true` add-to-cart (로컬 장바구니 전용) */
export const STORE_CART_REPLACE_FLAG = "replace" as const;
