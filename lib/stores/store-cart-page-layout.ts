/**
 * `/stores/[slug]/cart` 레이아웃 (배민·요기요식)
 *
 * - `ConditionalAppShell`: 뷰포트 높이 잠금 + `main` flex (문서 스크롤 아님)
 * - 셸: 상단 헤더·하단 주문 CTA `shrink-0`, 가운데만 `overflow-y-auto`
 * - `sticky`/`fixed` 미사용 — 중간 래퍼(`AppRouteTransition`) 때문에 깨지는 문제 회피
 */

import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";
import {
  BAEMIN_CART_PAGE_BG,
  BAEMIN_CART_PAGE_X,
  BAEMIN_CART_STACK_CLASS,
} from "@/lib/stores/store-baemin-cart-ui";

/** 페이지 루트 — 스타벅스 배경(#f6f6f6) */
export const STORE_CART_PAGE_ROOT_CLASS = `flex min-h-0 flex-1 flex-col overflow-hidden w-full min-w-0 ${BAEMIN_CART_PAGE_BG}`;

/** 가운데 스크롤 영역 — 페이지 배경과 동일 (`h-0` = flex 자식 높이 잠금, iOS touch scroll) */
export const STORE_CART_SCROLL_BODY_CLASS = `min-h-0 h-0 flex-1 overflow-y-auto overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] ${BAEMIN_CART_PAGE_BG}`;

/** 본문 — 좌우 16px 통일, 헤더~첫 카드 간격 최소 */
/** 하단 고정 CTA에 가리지 않도록 스크롤 하단 여백 */
export const STORE_CART_SCROLL_BODY_INNER_CLASS = `${APP_MAIN_COLUMN_CLASS} ${BAEMIN_CART_PAGE_X} pt-2 pb-4 ${BAEMIN_CART_STACK_CLASS}`;

/** `/stores/cart` 통합 장바구니 — 하단 5탭 clearance (슬러그 cart CTA 와 별도) */
export const STORE_GLOBAL_CART_SCROLL_BODY_INNER_CLASS = `${APP_MAIN_COLUMN_CLASS} ${BAEMIN_CART_PAGE_X} pt-2 ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS} ${BAEMIN_CART_STACK_CLASS}`;

export const STORE_CART_SCROLL_BODY_DATA_ATTR = "store-cart-scroll";

/** 상단 StoreBaeminCartTopBar 래퍼 */
export const STORE_CART_HEADER_CHROME_CLASS = `shrink-0 z-30 ${BAEMIN_CART_PAGE_BG}`;

/** 하단 주문 바 래퍼 — plane·safe-area 는 `StoreCartCheckoutActionBar` 가 담당 */
export const STORE_CART_FOOTER_CHROME_CLASS = "shrink-0 z-30 w-full min-w-0";

export const STORE_CART_CHECKOUT_ACTION_INNER_CLASS = "flex w-full min-w-0 items-center gap-3";

/** @deprecated flex 푸터 래퍼가 스타일 담당 — 앵커용 속성만 유지 */
export const STORE_CART_CHECKOUT_ACTION_CLASS = "";

export const STORE_CART_CHECKOUT_ACTION_DATA_ATTR = "store-cart-checkout-action";

/** @deprecated `STORE_CART_HEADER_CHROME_CLASS` + StoreBaeminCartTopBar bleed */
export const STORE_CART_HEADER_STICKY_CLASS = "";

/** @deprecated 내부 스크롤 — 별도 pb 불필요 */
export const STORE_CART_PAGE_CONTENT_PAD_CLASS = "";

export function isStoreCommerceCartCheckoutPath(pathname: string | null | undefined): boolean {
  const path = (pathname ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "";
  return /^\/stores\/[^/]+\/(cart|checkout)(\/|$)/.test(path);
}
