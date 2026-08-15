/**
 * Page-navigation secondary tabs — visual classes only.
 * EXISTING ELEMENTS ONLY — do not add tabs where a page has none.
 * CSS: `app/dibay-chrome-ssot.css`
 */

export const DIBAY_SECONDARY_TABS_CLASS = "dibay-secondary-tabs" as const;
export const DIBAY_SECONDARY_TAB_CLASS = "dibay-secondary-tab" as const;
export const DIBAY_SECONDARY_TAB_ACTIVE_CLASS =
  "dibay-secondary-tab dibay-secondary-tab--active" as const;

export function dibaySecondaryTabClass(active: boolean): string {
  return active ? DIBAY_SECONDARY_TAB_ACTIVE_CLASS : DIBAY_SECONDARY_TAB_CLASS;
}
