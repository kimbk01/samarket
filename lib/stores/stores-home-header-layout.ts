/**
 * `/stores` home chrome — content max-width + page inset SSOT.
 * TIER1·TIER2·TIER3·hub feed body must import from here (no duplicate 768px literals).
 */

export const STORES_HOME_CHROME_MAX_WIDTH_CLASS = "mx-auto w-full min-w-0 max-w-[768px]";

/** Horizontal inset — `app/delivery-tokens.css` `--delivery-page-x` */
export const STORES_HOME_CHROME_PAGE_X_CLASS = "px-[var(--delivery-page-x)]";

/** Header / category chrome inner row */
export const STORES_HOME_CHROME_INNER_CLASS = `${STORES_HOME_CHROME_MAX_WIDTH_CLASS} ${STORES_HOME_CHROME_PAGE_X_CLASS}`;

/** Hub feed body column — alias for chrome max-width */
export const STORES_HOME_CONTENT_COLUMN_CLASS = STORES_HOME_CHROME_MAX_WIDTH_CLASS;
