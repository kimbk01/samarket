/**
 * TRADE 메뉴 탭(`TradePrimaryTabs`) — DIBAY secondary visual SSOT.
 * Handlers / wipe / ALL▼ trailing behavior unchanged.
 */

import { DIBAY_SECONDARY_TABS_CLASS } from "@/lib/ui/dibay-secondary-tabs";

export const TRADE_PRIMARY_INLINE_SCROLL_NAV_CLASS = `${DIBAY_SECONDARY_TABS_CLASS} border-b-0 bg-transparent px-0`;

export const TRADE_PRIMARY_COMMUNITY_ROW1_SCROLL_NAV_CLASS = TRADE_PRIMARY_INLINE_SCROLL_NAV_CLASS;

/** 거래 1차 탭 — DIBAY secondary tab SSOT (handlers/wipe unchanged) */
export const TRADE_PRIMARY_TAB_PILL_SHELL = "dibay-secondary-tab relative overflow-hidden" as const;

export const TRADE_PRIMARY_TAB_LABEL_IDLE = "" as const;

export const TRADE_PRIMARY_TAB_LABEL_ACTIVE = "dibay-secondary-tab--active" as const;

export const TRADE_PRIMARY_TABS_ROW_CLASS =
  "flex h-[length:var(--dibay-secondary-tab-row-h,44px)] items-stretch";
