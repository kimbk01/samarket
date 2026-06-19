import { OWNER_DESKTOP_SHELL_MIN_TW } from "@/lib/business/owner-compact-shell-viewport";

/** 고정 좌측 메인 탭 레일 폭 */
export const MAIN_DESKTOP_SIDE_NAV_WIDTH_PX = 72;

export const MAIN_DESKTOP_SIDE_NAV_WIDTH_CLASS = "w-[72px]";

/** 본문이 레일과 겹치지 않도록 좌측 inset */
export const MAIN_DESKTOP_SIDE_NAV_CONTENT_INSET_CLASS = `${OWNER_DESKTOP_SHELL_MIN_TW}:pl-[72px]`;

/** 데스크탑 레일 구간 — 하단 탭 대신 일반 하단 여백 */
export const MAIN_SCROLL_PADDING_WITH_DESKTOP_SIDE_NAV_CLASS =
  "pb-[max(1rem,var(--safe-bottom))]";

/** FAB — 레일 오른쪽 하단 */
export const MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_BOTTOM_CLASS =
  "bottom-[calc(var(--safe-bottom)+10px)]";

export const MAIN_BOTTOM_NAV_FAB_DESKTOP_SIDE_NAV_LEFT_CLASS = "left-[calc(72px+1rem)]";
