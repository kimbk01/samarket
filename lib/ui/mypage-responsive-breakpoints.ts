/**
 * Legacy IA — MyPage hub responsive breakpoints SSOT.
 *
 * Contract (Phase 1 LOCK 2026-08-06):
 * - mobile: ≤767 (Tailwind `md` 미만)
 * - tablet: 768–1199 — **same 1-column flow** (no menu grid catalog)
 * - desktop: ≥1200 — **same 1-column** centered max-width
 *
 * FAIL: grid-cols-2 / grid-cols-3 menu parallel catalogs.
 * list+detail pane: NOT adopted (Karrot large-screen = NOT_AVAILABLE).
 */
import { APP_MOBILE_LAYOUT_MAX_PX } from "@/lib/ui/app-viewport-layout-breakpoints";

/** Mobile layout ends at this px (inclusive). Aligns with Tailwind `md` (768+). */
export const MYPAGE_MOBILE_MAX_PX = APP_MOBILE_LAYOUT_MAX_PX; // 767

/** Desktop band starts (tablet ends at 1199). */
export const MYPAGE_DESKTOP_MIN_PX = 1200;

/** @deprecated Alias — tablet no longer uses a separate multi-column class. */
export const MYPAGE_HOME_MENU_MOBILE_CLASS = "flex w-full min-w-0 flex-col gap-2";

/**
 * Single behavior-flow column for all viewports.
 * Kept export names for importer continuity; tablet/desktop no longer diverge.
 */
export const MYPAGE_HOME_MENU_TABLET_CLASS = MYPAGE_HOME_MENU_MOBILE_CLASS;

/** @deprecated No multi-column span — no-op class for legacy importers. */
export const MYPAGE_HOME_MENU_TABLET_ADMIN_SPAN_CLASS = "w-full min-w-0";

export const MYPAGE_HOME_MENU_DESKTOP_CLASS = MYPAGE_HOME_MENU_MOBILE_CLASS;

/** Canonical single-column flow stack (prefer this in new code). */
export const MYPAGE_HOME_MENU_FLOW_CLASS = "flex w-full min-w-0 flex-col gap-2";

export function mypageHubBreakpointAt(widthPx: number): "mobile" | "tablet" | "desktop" {
  if (widthPx <= MYPAGE_MOBILE_MAX_PX) return "mobile";
  if (widthPx < MYPAGE_DESKTOP_MIN_PX) return "tablet";
  return "desktop";
}

/**
 * 내정보 하위 화면 본문 폭·좌우 여백 (최종 설계 §1.8) — 태블릿·데스크톱도 같은 1열,
 * 본문 최대 40rem 가운데 정렬, 좌우 16px(모바일) / 20px(md+). 앱 공용 폭 클래스는 건드리지 않는다.
 */
export const MYPAGE_COLUMN_MAX_WIDTH_CLASS = "max-w-[40rem]";
export const MYPAGE_GUTTER_X_CLASS = "px-4 md:px-5";

/**
 * 내정보 하위 화면 본문 1열 — 폰 16px · 768px 이상 20px · 최대 640px 가운데 (설계서 v3 §2).
 * 거터는 **이 클래스 한 번만** 적용한다. 앱 피드 거터(`APP_MAIN_GUTTER_X_CLASS` 10/8)나
 * `APP_MAIN_TAB_SCROLL_BODY_CLASS` 안에 다시 넣지 않는다 (이중 여백 26/24px 금지).
 */
export const MYPAGE_BODY_COLUMN_CLASS = `mx-auto w-full min-w-0 ${MYPAGE_COLUMN_MAX_WIDTH_CLASS} ${MYPAGE_GUTTER_X_CLASS}`;

/** 본문 바깥 스크롤 래퍼 — 가로 여백 없음 (거터는 `MYPAGE_BODY_COLUMN_CLASS` 단독 소유) */
export const MYPAGE_SCROLL_BODY_CLASS = "flex min-h-0 w-full min-w-0 flex-1 flex-col";
