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
