/**
 * TRADE 메뉴 탭(`TradePrimaryTabs`) — PRIMARY SECTION NAV (dibay secondary SSOT).
 * Wipe specialty removed — active/idle = dibay-secondary-tab.
 */

import {
  DIBAY_SECONDARY_TABS_CLASS,
  dibaySecondaryTabClass,
} from "@/lib/ui/dibay-secondary-tabs";

export const TRADE_PRIMARY_INLINE_SCROLL_NAV_CLASS = `${DIBAY_SECONDARY_TABS_CLASS} border-b-0 bg-transparent px-0`;

export const TRADE_PRIMARY_COMMUNITY_ROW1_SCROLL_NAV_CLASS = TRADE_PRIMARY_INLINE_SCROLL_NAV_CLASS;

/** @deprecated Use dibaySecondaryTabClass — kept name for call-site migration */
export const TRADE_PRIMARY_TAB_PILL_SHELL = "dibay-secondary-tab" as const;

export const TRADE_PRIMARY_TAB_LABEL_IDLE = "" as const;

export const TRADE_PRIMARY_TAB_LABEL_ACTIVE = "dibay-secondary-tab--active" as const;

export function tradePrimaryTabClass(active: boolean): string {
  return dibaySecondaryTabClass(active);
}

export const TRADE_PRIMARY_TABS_ROW_CLASS =
  "flex h-[length:var(--dibay-secondary-tab-row-h,44px)] items-stretch";
