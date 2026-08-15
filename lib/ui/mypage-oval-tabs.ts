/**
 * MyPage trade hub / purchase·sales — oval tab strip → DIBAY secondary visual SSOT.
 * Handlers unchanged. Do not add tabs where page has none.
 */

import { DIBAY_SECONDARY_TABS_CLASS, dibaySecondaryTabClass } from "@/lib/ui/dibay-secondary-tabs";

export const MYPAGE_OVAL_TABS_SCROLL_CLASS = DIBAY_SECONDARY_TABS_CLASS;

export const MYPAGE_OVAL_TAB_BASE_CLASS = "dibay-secondary-tab";

export const MYPAGE_OVAL_TAB_ACTIVE_CLASS = "dibay-secondary-tab--active";

export const MYPAGE_OVAL_TAB_INACTIVE_CLASS = "";

export function mypageOvalTabClass(active: boolean): string {
  return dibaySecondaryTabClass(active);
}
