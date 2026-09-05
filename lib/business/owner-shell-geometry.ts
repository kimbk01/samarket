/**
 * Owner Admin fixed geometry SSOT — CSS variables on `body[data-owner-compact-shell]`.
 * Pages/FAB/sheets consume these; do not invent route-local pb/bottom offsets.
 */

/** CSS custom property names (document on owner compact shell). */
export const OWNER_SHELL_CSS_VARS = {
  headerHeight: "--owner-header-height",
  bottomNavHeight: "--owner-bottom-nav-height",
  safeTop: "--owner-safe-top",
  safeBottom: "--owner-safe-bottom",
  fixedActionHeight: "--owner-fixed-action-height",
  contentTop: "--owner-content-top",
  contentBottom: "--owner-content-bottom",
  fabBottom: "--owner-fab-bottom",
} as const;

/** Bottom nav toolbar height (px) — sync with `OWNER_MOBILE_BOTTOM_NAV_HEIGHT_CLASS`. */
export const OWNER_BOTTOM_NAV_HEIGHT_PX = 60;

/** Gap between Owner bottom nav top edge and floating FAB. */
export const OWNER_FAB_ABOVE_NAV_GAP_PX = 10;

/**
 * Support FAB / floating action bottom offset when Owner bottom nav occupies clearance.
 * Consumes `--owner-fab-bottom` from `owner-compact-shell.css`.
 */
export const OWNER_FAB_BOTTOM_OFFSET_CLASS = "bottom-[var(--owner-fab-bottom)]";

/** Main content padding-bottom class — already wired to `--owner-shell-main-pb` / `--owner-content-bottom`. */
export const OWNER_CONTENT_BOTTOM_PAD_CLASS = "owner-compact-shell__main-pb";
