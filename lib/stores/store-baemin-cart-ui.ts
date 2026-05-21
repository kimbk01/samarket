/**
 * dibaY 장바구니 UI — 배민식 카드·여백 (흰 배경 + 섹션 테두리).
 * `/stores/[slug]/cart` 전용.
 */

import { DeliveryTheme } from "@/lib/design/delivery-theme";

/** 페이지·스크롤 영역 — 회색 배경 금지 */
export const BAEMIN_CART_PAGE_BG = "bg-white";

/** 본문 좌우 16px 통일 (philife 비대칭 inset 사용 안 함) */
export const BAEMIN_CART_PAGE_X = "px-4";

/** 섹션 카드 간 세로 간격 — 헤더 직후 공간 최소 */
export const BAEMIN_CART_STACK_CLASS = "space-y-2";

export const BAEMIN_CART_CARD_CLASS =
  "overflow-hidden rounded-[4px] border border-[var(--delivery-border-section)] bg-white";

export const BAEMIN_CART_SECTION_CARD_CLASS = BAEMIN_CART_CARD_CLASS;
export const BAEMIN_CART_SECTION_TITLE_CLASS = DeliveryTheme.sectionCard.title;
export const BAEMIN_CART_CARD_INSET_CLASS = BAEMIN_CART_CARD_CLASS;
export const BAEMIN_CART_DIVIDER_CLASS = "mx-4 border-t border-[var(--delivery-border-section)]";

export const BAEMIN_CART_FOOTER_PROMO_CLASS =
  "text-[13px] font-semibold leading-snug text-[#2563EB]";

/** 하단 주문 바 — 최소 주문 충족 */
export const BAEMIN_CART_FOOTER_MIN_MET_CLASS =
  "text-[12px] font-semibold leading-snug text-[#16A34A]";

/** 하단 주문 바 — 최소 주문 미달 */
export const BAEMIN_CART_FOOTER_MIN_SHORT_CLASS =
  "text-[12px] font-medium leading-snug text-[#B45309]";

/** 결제·연락처 카드 본문 */
export const BAEMIN_CART_CHECKOUT_INNER_CLASS = "space-y-4 px-4 py-4";

/** 카드 안 섹션 구분(가로선만, 세로선 없음) */
export const BAEMIN_CART_CHECKOUT_SECTION_DIVIDER_CLASS =
  "border-t border-[var(--delivery-border-section)] pt-4";

/** 배송지 선택 — 바깥 테두리 1줄, 항목은 구분선만 */
export const BAEMIN_CART_ADDRESS_LIST_CLASS =
  "mt-2 list-none overflow-hidden rounded-[4px] border border-[var(--delivery-border-section)] divide-y divide-[var(--delivery-border-section)] bg-white p-0";

export const BAEMIN_CART_ADDRESS_ROW_CLASS = "p-3";

export const BAEMIN_CART_ADDRESS_ROW_SELECTED_CLASS = "bg-[#E8F4FA]";

/** 하단 주문 CTA — delivery 레이어와 무관하게 고정(primary, resize 없음) */
export const BAEMIN_CART_ORDER_BTN_CLASS =
  "inline-flex h-[52px] min-w-[9.75rem] max-w-[52%] shrink-0 cursor-pointer items-center justify-center rounded-[4px] border-0 bg-[#2386B1] px-4 text-[15px] font-bold leading-none text-white shadow-none transition-[background-color] duration-150 [appearance:none] resize-none active:bg-[#1a6a8f] disabled:cursor-not-allowed disabled:bg-[#B8B8B8] disabled:text-white";

/** 장바구니 타이포·간격 */
export const BAEMIN_CART_TYPE = {
  pageTitle: "text-[17px] font-bold leading-[1.35]",
  storeName: "text-[15px] font-bold leading-[1.35]",
  sectionTitle: DeliveryTheme.typo.sectionTitle,
  itemTitle: "text-[15px] font-bold leading-[1.35]",
  bodyMuted: "text-[13px] leading-[1.45] text-[var(--delivery-text-muted)]",
  priceMeta: "text-[13px] leading-[1.45] text-[var(--delivery-text-muted)]",
  itemTotal: "text-[15px] font-bold leading-[1.35] tabular-nums",
  upsellPrice: "text-[14px] tabular-nums",
  btnOption:
    "inline-flex h-8 min-h-[var(--delivery-touch-min)] items-center justify-center rounded-[4px] border border-[#E0E0E0] bg-white px-3 text-[13px] font-semibold text-[#333]",
  btnQty: "h-8",
  thumb: "h-[72px] w-[72px] rounded-[8px]",
  thumbUpsell: "h-14 w-14 rounded-[8px]",
  rowPy: "py-4",
  storeHeaderPy: "py-3",
  cardGap: "",
  pagePadX: "",
} as const;
