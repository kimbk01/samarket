/**
 * Page-navigation secondary tabs — visual classes only.
 * EXISTING ELEMENTS ONLY — do not add tabs where a page has none.
 * CSS: `app/dibay-chrome-ssot.css`
 *
 * PRIMARY SECTION NAV host must inherit domain pale — never `bg-sam-surface` white break.
 * STATUS / CATEGORY are variants (same family tokens, separate role classes).
 */

export const DIBAY_SECONDARY_TABS_CLASS = "dibay-secondary-tabs" as const;
export const DIBAY_SECONDARY_TAB_CLASS = "dibay-secondary-tab" as const;
export const DIBAY_SECONDARY_TAB_ACTIVE_CLASS =
  "dibay-secondary-tab dibay-secondary-tab--active" as const;

/** Chrome host around PRIMARY secondary row — domain surface inherit. */
export const DIBAY_CHROME_SECONDARY_HOST_CLASS =
  "min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]" as const;

/** STATUS / FILTER variant row (not route PRIMARY). */
export const DIBAY_STATUS_TABS_CLASS = "dibay-secondary-tabs dibay-status-tabs" as const;

/**
 * CATEGORY RAIL host (topics / taxonomy — not page PRIMARY).
 * Scroll is owned by the child track (`overflow-x-auto`) — never put
 * `overflow-x-hidden` on this host (do not reuse `APP_MAIN_HEADER_INNER_CLASS`).
 */
export const DIBAY_CATEGORY_RAIL_HOST_CLASS =
  "dibay-category-rail-host min-w-0 bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]" as const;

export function dibaySecondaryTabClass(active: boolean): string {
  return active ? DIBAY_SECONDARY_TAB_ACTIVE_CLASS : DIBAY_SECONDARY_TAB_CLASS;
}
