/**
 * Slice 9 Phase 1 — MyPage hub responsive breakpoints SSOT.
 *
 * Values match existing hub contract (no visual change):
 * - mobile: Tailwind `md` 미만 (= APP_MOBILE_LAYOUT_MAX_PX 767)
 * - tablet: md … max 1025px
 * - desktop: min 1025px
 *
 * DO NOT change these numbers without a new Slice 9 contract revision.
 * DO NOT couple to owner compact shell or BottomNav here.
 */
import { APP_MOBILE_LAYOUT_MAX_PX } from "@/lib/ui/app-viewport-layout-breakpoints";

/** Mobile layout ends at this px (inclusive). Aligns with Tailwind `md` (768+). */
export const MYPAGE_MOBILE_MAX_PX = APP_MOBILE_LAYOUT_MAX_PX; // 767

/** Desktop hub column layout starts at this min-width (existing MyPageHomeDashboard). */
export const MYPAGE_DESKTOP_MIN_PX = 1025;

/** Tailwind class fragments — literals kept for JIT scan; must equal MYPAGE_DESKTOP_MIN_PX. */
export const MYPAGE_HOME_MENU_MOBILE_CLASS = "flex flex-col gap-3 md:hidden";

export const MYPAGE_HOME_MENU_TABLET_CLASS =
  "hidden md:max-[1025px]:grid md:max-[1025px]:grid-cols-2 md:max-[1025px]:gap-4";

export const MYPAGE_HOME_MENU_TABLET_ADMIN_SPAN_CLASS = "md:max-[1025px]:col-span-2";

export const MYPAGE_HOME_MENU_DESKTOP_CLASS =
  "hidden min-[1025px]:grid min-[1025px]:grid-cols-3 min-[1025px]:gap-4";

export function mypageHubBreakpointAt(widthPx: number): "mobile" | "tablet" | "desktop" {
  if (widthPx <= MYPAGE_MOBILE_MAX_PX) return "mobile";
  if (widthPx < MYPAGE_DESKTOP_MIN_PX) return "tablet";
  return "desktop";
}
