/**
 * MyPage trade hub / purchase·sales management — oval (pill) tab strip.
 * Scoped to trade history UIs only; do not replace global underline `sam-tab`.
 */

export const MYPAGE_OVAL_TABS_SCROLL_CLASS =
  "flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 overflow-x-auto overflow-y-visible py-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const MYPAGE_OVAL_TAB_BASE_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-full px-3.5 py-2 text-[13px] font-semibold leading-none transition-colors";

export const MYPAGE_OVAL_TAB_ACTIVE_CLASS = "bg-[#006241] text-white shadow-sm";

export const MYPAGE_OVAL_TAB_INACTIVE_CLASS =
  "bg-[#F2F0EB] text-[#1e3932] hover:bg-[#E8E4DE] active:bg-[#E0DBD4]";

export function mypageOvalTabClass(active: boolean): string {
  return `${MYPAGE_OVAL_TAB_BASE_CLASS} ${active ? MYPAGE_OVAL_TAB_ACTIVE_CLASS : MYPAGE_OVAL_TAB_INACTIVE_CLASS}`;
}
