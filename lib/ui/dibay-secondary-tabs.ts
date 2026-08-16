/**
 * Page-navigation secondary tabs — visual classes only.
 * EXISTING ELEMENTS ONLY — do not add tabs where a page has none.
 * CSS: `app/dibay-chrome-ssot.css`
 *
 * PRIMARY SECTION NAV host must inherit domain pale — never `bg-sam-surface` white break.
 * STATUS / CATEGORY are variants (same family tokens, separate role classes).
 *
 * CONTRACT — Community / Trade / Chat 2단 행 기하:
 * - row gap = `--dibay-secondary-tab-gap` (8px) only — never Tailwind `gap-1`
 * - track = `DIBAY_SECONDARY_TAB_TRACK_CLASS` (dibay-secondary-tabs + px-0)
 * - inner = COLUMN + GUTTER; host does not use `APP_MAIN_HEADER_INNER` (overflow-x-hidden)
 */

import { APP_MAIN_COLUMN_CLASS, APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";

export const DIBAY_SECONDARY_TABS_CLASS = "dibay-secondary-tabs" as const;
export const DIBAY_SECONDARY_TAB_CLASS = "dibay-secondary-tab" as const;
export const DIBAY_SECONDARY_TAB_ACTIVE_CLASS =
  "dibay-secondary-tab dibay-secondary-tab--active" as const;

/** Chrome host around PRIMARY secondary row — domain surface inherit. */
export const DIBAY_CHROME_SECONDARY_HOST_CLASS =
  "min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]" as const;

/** Host + bottom divider (community / trade / chat hub). */
export const DIBAY_CHROME_SECONDARY_HOST_BORDERED_CLASS =
  `${DIBAY_CHROME_SECONDARY_HOST_CLASS} border-b border-[color:var(--dibay-domain-divider,var(--sector-header-border))]` as const;

/** STATUS / FILTER variant row (not route PRIMARY). */
export const DIBAY_STATUS_TABS_CLASS = "dibay-secondary-tabs dibay-status-tabs" as const;

/**
 * CATEGORY RAIL host (topics / taxonomy — not page PRIMARY).
 * Scroll is owned by the child track (`overflow-x-auto`) — never put
 * `overflow-x-hidden` on this host (do not reuse `APP_MAIN_HEADER_INNER_CLASS`).
 */
export const DIBAY_CATEGORY_RAIL_HOST_CLASS =
  "dibay-category-rail-host min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]" as const;

/** COLUMN + gutter — 2단 행 좌우 시작점 SSOT (좌 10px / 우 8px). */
export const DIBAY_SECONDARY_TAB_INNER_CLASS =
  `${APP_MAIN_COLUMN_CLASS} ${APP_MAIN_GUTTER_X_CLASS}` as const;

/**
 * Leading chip + scroll track (+ optional trailing) row.
 * Gap = SSOT 8px only.
 */
export const DIBAY_SECONDARY_TAB_ROW_CLASS =
  "flex h-[length:var(--dibay-secondary-tab-row-h,44px)] min-w-0 max-w-full items-center gap-[length:var(--dibay-secondary-tab-gap,8px)]" as const;

/**
 * Horizontal scroll track inside the row — pad-x off (gutter owns inset).
 */
export const DIBAY_SECONDARY_TAB_TRACK_CLASS =
  `${DIBAY_SECONDARY_TABS_CLASS} min-w-0 flex-1 border-b-0 bg-transparent px-0` as const;

/**
 * Label inside pill — truncate only; font-size/weight from `.dibay-secondary-tab` (13/15).
 * DO NOT force `text-[12px]` (I18N_COMPACT) on secondary pills.
 */
export const DIBAY_SECONDARY_TAB_LABEL_CLASS =
  "relative z-[1] block min-w-0 max-w-[min(10rem,38vw)] truncate" as const;

/** Sort chip chevron — inherits tab idle/active fg. */
export const DIBAY_SECONDARY_TAB_CHEVRON_CLASS =
  "relative z-[1] h-3.5 w-3.5 shrink-0" as const;

export function dibaySecondaryTabClass(active: boolean): string {
  return active ? DIBAY_SECONDARY_TAB_ACTIVE_CLASS : DIBAY_SECONDARY_TAB_CLASS;
}
