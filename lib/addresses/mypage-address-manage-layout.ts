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
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

export const MYPAGE_ADDRESS_MANAGE_PAGE_ROOT_CLASS =
  "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-sam-app";

export const MYPAGE_ADDRESS_MANAGE_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch] bg-sam-app";

/** 내정보 밖(온보딩 임베드 등) 공용 — 앱 컬럼, 거터 없음 */
export const ADDRESS_MANAGE_SCROLL_INNER_APP_COLUMN_CLASS = `${APP_MAIN_COLUMN_CLASS} flex min-w-0 flex-col gap-4 py-4`;

/** `/mypage/addresses*` — 내정보 본문 1열 (폰 16px · 768+ 20px · 최대 640px, 설계서 v3 §2) */
export const MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS = `${MYPAGE_BODY_COLUMN_CLASS} flex flex-col gap-4 py-4`;

/** 경로별 본문 열 — 내정보 경로만 내정보 1열, 그 외(임베드)는 기존 앱 컬럼 유지 */
export function resolveAddressManageScrollInnerClass(pathname: string | null | undefined, embedded: boolean): string {
  const p = (pathname ?? "").split("?")[0] ?? "";
  if (!embedded && (p === "/mypage/addresses" || p.startsWith("/mypage/addresses/"))) {
    return MYPAGE_ADDRESS_MANAGE_SCROLL_INNER_CLASS;
  }
  return ADDRESS_MANAGE_SCROLL_INNER_APP_COLUMN_CLASS;
}

/** 하단 확인·주소 추가 — 화면 하단 plane (sticky/fixed 아님) */
export const MYPAGE_ADDRESS_MANAGE_FOOTER_WRAP_CLASS = `z-30 w-full min-w-0 ${ADDR_BOTTOM_BAR}`;
