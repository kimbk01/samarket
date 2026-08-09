/**
 * 매장 소비자 하단 액션 바 — 배민 **참고**(동일 복제 아님). 페이지별 높이·좌측 정보·CTA 활성/비활성.
 *
 * | variant | 화면 | 좌측 | 우측 CTA |
 * | menu-cart-active | 매장 메뉴·카트 있음 | 합계(큰 글씨)·최소주문 부족 | 장바구니/주문 확인 + 수량 뱃지 |
 * | menu-cart-idle | 매장 메뉴·빈 카트 | 영업·최소주문·배달/픽업 | 카트 미리보기 아이콘 |
 * | product-add | 상품 상세 | 최소주문·카트 소계·부족액 | `{금액} 담기` (옵션·품절 시 비활성) |
 * | sheet-add | 옵션 시트 | 이번 선택 합계 | 담기 + 카트 뱃지 |
 * | cart-checkout | 장바구니 | 결제금액·할인·최소주문·차단 사유 | 가게배달 주문하기 |
 */

import { APP_MAIN_COLUMN_MAX_WIDTH_CLASS } from "@/lib/ui/app-content-layout";
import { STORE_ORDER_TOUCH_BTN } from "@/components/stores/store-order-detail/store-order-brand";

export type StoreCommerceActionVariant =
  | "menu-cart-active"
  | "menu-cart-idle"
  | "product-add"
  | "sheet-add"
  | "cart-checkout"
  | "review-submit";

export const STORE_COMMERCE_ACTION_VARIANT_DATA_ATTR = "data-store-action-variant";

/** primary CTA 높이 — 기존 매장 스트립 `h-[52px]` 유지 */
export const STORE_COMMERCE_ACTION_BTN_H_CLASS = "h-[3.25rem] min-h-[3.25rem]";

export const STORE_COMMERCE_ACTION_SHELL_CLASS =
  "store-commerce-action-shell delivery-ui fixed inset-x-0 bottom-0 z-[50] flex w-full flex-col items-stretch pointer-events-none";

export const STORE_COMMERCE_ACTION_PLANE_CLASS =
  "store-commerce-action-plane pointer-events-auto w-full min-w-0 border-t border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] shadow-[0_-4px_16px_rgba(17,24,39,0.10)]";

export const STORE_COMMERCE_ACTION_INLINE_PLANE_CLASS =
  `store-commerce-action-plane shrink-0 w-full min-w-0 ${STORE_COMMERCE_ACTION_PLANE_CLASS}`;

export const STORE_COMMERCE_ACTION_COLUMN_CLASS = APP_MAIN_COLUMN_MAX_WIDTH_CLASS;

/** 고정 높이 없음 — variant CSS `min-height` + `py` 로 다줄 좌측 허용 */
export function storeCommerceActionRowClass(variant: StoreCommerceActionVariant): string {
  const align = variant === "product-add" ? "items-end" : "items-center";
  return [
    "store-commerce-action-row flex w-full min-w-0 gap-3 px-4",
    align,
    STORE_COMMERCE_ACTION_COLUMN_CLASS,
  ].join(" ");
}

export const STORE_COMMERCE_ACTION_CAPTION_CLASS =
  "text-[12px] font-medium leading-[var(--delivery-lh-caption)] text-[color:var(--delivery-text-muted)]";

/** 매장 메뉴 카트 스트립 합계 */
export const STORE_COMMERCE_ACTION_PRICE_HERO_CLASS =
  "text-[18px] font-extrabold leading-[var(--delivery-lh-price)] tabular-nums text-[color:var(--delivery-text-main)]";

export const STORE_COMMERCE_ACTION_PRIMARY_TEXT_CLASS =
  "text-[17px] font-bold leading-[var(--delivery-lh-card-title)] tabular-nums text-[color:var(--delivery-text-main)]";

export const STORE_COMMERCE_ACTION_SECONDARY_TEXT_CLASS =
  "text-[13px] font-semibold leading-[var(--delivery-lh-sub)] text-[color:var(--delivery-text-sub)]";

/** 옵션 시트 좌측 합계 */
export const STORE_COMMERCE_ACTION_SHEET_PRICE_CLASS =
  "text-[18px] font-extrabold leading-[var(--delivery-lh-price)] tabular-nums tracking-tight text-[color:var(--delivery-text-main)]";

export const STORE_COMMERCE_ACTION_HINT_AMBER_CLASS =
  "mt-1 text-[12px] font-semibold leading-[var(--delivery-lh-caption)] text-[color:var(--delivery-warning)]";

export const STORE_COMMERCE_ACTION_HINT_OK_CLASS =
  "mt-1 text-[12px] font-medium leading-[var(--delivery-lh-caption)] text-[color:var(--delivery-text-sub)]";

export const STORE_COMMERCE_ACTION_ERROR_CLASS =
  "px-4 pt-2 text-center text-[12px] font-medium text-[color:var(--delivery-danger)]";

const STORE_COMMERCE_ACTION_BTN_BASE = [
  "inline-flex items-center justify-center gap-2 rounded-[var(--delivery-radius)] border-0 px-4 text-[15px] font-bold leading-none shadow-none transition-[background-color,transform] duration-150 [appearance:none]",
  STORE_COMMERCE_ACTION_BTN_H_CLASS,
  STORE_ORDER_TOUCH_BTN,
].join(" ");

/** 활성 — 브랜드 primary */
export const STORE_COMMERCE_ACTION_BTN_ACTIVE_CLASS = [
  STORE_COMMERCE_ACTION_BTN_BASE,
  "bg-[color:var(--delivery-primary)] text-white hover:bg-[color:var(--delivery-primary-hover)] active:scale-[0.98] active:bg-[color:var(--delivery-primary-active)]",
].join(" ");

/** 비활성 — 배민 담기/주문하기 회색 */
export const STORE_COMMERCE_ACTION_BTN_DISABLED_CLASS = [
  STORE_COMMERCE_ACTION_BTN_BASE,
  "cursor-not-allowed bg-[color:var(--delivery-btn-disabled)] text-white active:scale-100",
].join(" ");

/** 아이콘·뱃지 동반 CTA 등 — 폭 고정, 줄이지 않음 */
export function storeCommerceActionBtnClass(disabled: boolean, extra = ""): string {
  return `${disabled ? STORE_COMMERCE_ACTION_BTN_DISABLED_CLASS : STORE_COMMERCE_ACTION_BTN_ACTIVE_CLASS} shrink-0 ${extra}`.trim();
}

/**
 * 액션 행 우측 텍스트 CTA (카트 주문·상품 담기·미리보기).
 * 좌측 `min-w-0` 정보와 한 줄을 나누고, 긴 i18n 은 버튼 안에서 truncate.
 *
 * DO NOT: `shrink-0` + `min-w-[9rem+]` + `whitespace-nowrap` 조합
 * (좁은 기기에서 뷰포트 가로 overflow 재발).
 */
export function storeCommerceActionSideCtaClass(disabled: boolean, extra = ""): string {
  return [
    disabled ? STORE_COMMERCE_ACTION_BTN_DISABLED_CLASS : STORE_COMMERCE_ACTION_BTN_ACTIVE_CLASS,
    "min-w-0 max-w-[58%] shrink overflow-hidden",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

/** 사이드 CTA 라벨 — 버튼 자식에 필수 */
export const STORE_COMMERCE_ACTION_SIDE_CTA_LABEL_CLASS = "min-w-0 truncate";

/** 배민 장바구니 보기 버튼 안 검은 수량 뱃지 */
export const STORE_COMMERCE_ACTION_BTN_CART_BADGE_CLASS =
  "flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-[color:var(--delivery-dark)] px-1.5 text-[12px] font-bold leading-none text-white";

export const STORE_COMMERCE_ACTION_CART_ICON_BTN_CLASS = [
  "flex shrink-0 items-center justify-center rounded-[var(--delivery-radius-pill)] border border-[color:var(--delivery-primary)] bg-white text-[color:var(--delivery-primary)] transition-[background-color,transform] duration-150 hover:bg-[color:var(--delivery-primary-soft)] active:scale-[0.96]",
  STORE_COMMERCE_ACTION_BTN_H_CLASS,
  "w-[3.25rem]",
  STORE_ORDER_TOUCH_BTN,
].join(" ");

export const STORE_COMMERCE_ACTION_SUBMIT_FULL_CLASS = [
  "flex w-full items-center justify-center rounded-[var(--delivery-radius)] border-0 bg-[color:var(--delivery-dark)] px-4 text-[16px] font-bold leading-none text-white transition-[background-color,opacity] duration-150",
  STORE_COMMERCE_ACTION_BTN_H_CLASS,
  "disabled:cursor-not-allowed disabled:opacity-40",
  STORE_ORDER_TOUCH_BTN,
].join(" ");

/** @deprecated — `storeCommerceActionBtnClass` */
export const STORE_COMMERCE_ACTION_BTN_CLASS = STORE_COMMERCE_ACTION_BTN_ACTIVE_CLASS;

/**
 * plane 하단 inset — safe-area 는 흰 plane 안쪽만(셸 바깥 padding 금지 → 끝단 틈새 방지).
 * `app-bottom-nav-plane` 과 동일 패턴.
 */
export const STORE_COMMERCE_ACTION_PLANE_BOTTOM_PAD =
  "calc(var(--store-commerce-action-plane-pb,0.75rem)+var(--safe-bottom))";

/** @deprecated 셸 inline padding 제거 — plane CSS 가 담당 */
export function storeCommerceActionShellStyle(): Record<string, never> {
  return {};
}

/** variant 별 본문 하단 여백(plane min-height + plane pb + safe-area) */
export function storeCommerceActionContentPadClass(variant: StoreCommerceActionVariant): string {
  const core =
    variant === "menu-cart-active"
      ? "5.75rem"
      : variant === "menu-cart-idle"
        ? "4.75rem"
        : variant === "product-add"
          ? "6.5rem"
          : variant === "sheet-add"
            ? "4.75rem"
            : variant === "cart-checkout"
              ? "6.25rem"
              : "5.75rem";
  return `pb-[calc(${core}+var(--store-commerce-action-plane-pb,0.75rem)+var(--safe-bottom))]`;
}

export const STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS =
  storeCommerceActionContentPadClass("menu-cart-active");

export const STORE_DETAIL_ROOT_BOTTOM_PADDING_NO_STRIP_CLASS =
  storeCommerceActionContentPadClass("menu-cart-idle");

export const STORE_DETAIL_ROOT_BOTTOM_PADDING_CLASS =
  STORE_DETAIL_ROOT_BOTTOM_PADDING_WITH_CART_STRIP_CLASS;

export function storeCommerceActionToastBottomCss(totalQty: number): string {
  const core = totalQty > 0 ? "5.75rem" : "4.75rem";
  return `max(calc(${core} + var(--store-commerce-action-plane-pb, 0.75rem) + var(--safe-bottom)), ${totalQty > 0 ? "96px" : "80px"})`;
}
