/**
 * Page-navigation secondary tabs — visual classes only.
 * EXISTING ELEMENTS ONLY — do not add tabs where a page has none.
 * CSS: `app/dibay-chrome-ssot.css`
 *
 * Host under Header must use domain pale — never `bg-sam-surface` white break.
 * Authority match: CommunityFeed stickyBelow wrapper.
 */

export const DIBAY_SECONDARY_TABS_CLASS = "dibay-secondary-tabs" as const;
export const DIBAY_SECONDARY_TAB_CLASS = "dibay-secondary-tab" as const;
export const DIBAY_SECONDARY_TAB_ACTIVE_CLASS =
  "dibay-secondary-tab dibay-secondary-tab--active" as const;

/** Chrome host around secondary row — same token as Header domain surface. */
export const DIBAY_CHROME_SECONDARY_HOST_CLASS =
  "min-w-0 overflow-x-hidden bg-[color:var(--dibay-domain-surface,var(--sector-header-bg))]" as const;

export function dibaySecondaryTabClass(active: boolean): string {
  return active ? DIBAY_SECONDARY_TAB_ACTIVE_CLASS : DIBAY_SECONDARY_TAB_CLASS;
}
