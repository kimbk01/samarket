/**
 * `/mypage/addresses` 목록 — cart/checkout 과 동일한 뷰포트 잠금 + 내부 스크롤.
 *
 * - `ConditionalAppShell`: `isMypageAddressFlowPage` → `isMainColumnViewportLocked`
 * - 페이지: `MySubpageHeader inlineChrome`(shrink-0) → scroll(flex-1 min-h-0) → footer(shrink-0)
 * - 전역 `RegionBar` 는 `regionBarInLayout` + 뷰포트 잠금 시 마운트되지 않음 — 로컬 헤더 필수
 * - `min-h-screen` 금지 — `main` 이 스크롤하면 flex 체인이 깨져 목록·푸터가 어긋남
 */

import { APP_MAIN_COLUMN_CLASS } from "@/lib/ui/app-content-layout";
import { ADDR_BOTTOM_BAR } from "@/lib/ui/address-flow-viber";

export const MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS =
  "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-sam-app";

export const MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch] bg-sam-app";

export const MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS = `${APP_MAIN_COLUMN_CLASS} flex min-w-0 flex-col gap-4 py-4`;

/** 하단 확인·주소 추가 — 화면 하단 plane (sticky/fixed 아님) */
export const MYPAGE_ADDRESS_MANAGE_FOOTER_WRAP_CLASS = `z-30 w-full min-w-0 ${ADDR_BOTTOM_BAR}`;
