/**
 * 매장 주문 리뷰 — cart/checkout 과 동일: 뷰포트 잠금 + 가운데 스크롤 + 하단 CTA 고정(flex, `fixed` 금지).
 */

import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

export const STORE_ORDER_REVIEW_PAGE_ROOT_CLASS =
  "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-sam-app";

export const STORE_ORDER_REVIEW_SCROLL_BODY_CLASS =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]";

/** 배달 주문 허브 `/orders/store/[id]/review` — 앱 컬럼 + 피드 거터 (변경 없음) */
export const STORE_ORDER_REVIEW_SCROLL_INNER_CLASS = `${APP_MAIN_COLUMN_CLASS} w-full min-w-0 space-y-6 py-4 ${APP_MAIN_GUTTER_X_CLASS}`;

/** 내정보 `/mypage/store-orders/[id]/review` — 내정보 본문 1열 (16/20·640, 설계서 v3 §2) */
export const STORE_ORDER_REVIEW_SCROLL_INNER_MYPAGE_CLASS = `${MYPAGE_BODY_COLUMN_CLASS} space-y-6 py-4`;

/** `ordersHub`(배달 주문 허브) 여부로 본문 열 선택 */
export function resolveStoreOrderReviewScrollInnerClass(ordersHub: boolean): string {
  return ordersHub ? STORE_ORDER_REVIEW_SCROLL_INNER_CLASS : STORE_ORDER_REVIEW_SCROLL_INNER_MYPAGE_CLASS;
}

/** 하단 등록 CTA — `StoreCommerceBottomActionShell` inline 래퍼 */
export const STORE_ORDER_REVIEW_FOOTER_CHROME_CLASS = "shrink-0 z-10 w-full min-w-0";
