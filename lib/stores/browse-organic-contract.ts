/**
 * CUT 3 — BROWSE organic discovery contract (SSOT labels).
 * Does not invent ranking metrics; documents runtime owners only.
 */

/** Data-contract max representative products per BROWSE store row (not simultaneous UI count). */
export const BROWSE_ORGANIC_REPRESENTATIVE_PRODUCTS_MAX = 4 as const;

/** Membership = store_categories / store_topics FKs only (no business_type inference). */
export const BROWSE_ORGANIC_MEMBERSHIP_AUTHORITY =
  "stores.store_category_id+stores.store_topic_id" as const;

/** Default organic sort id in URL/API (UI “기본순”). */
export const BROWSE_ORGANIC_DEFAULT_SORT_ID = "default" as const;

/** sort=fast metric owner — explicit prep_time_minutes only (see readExplicitStorePrepTimeMinutes). */
export const BROWSE_ORGANIC_SORT_FAST_METRIC = "prep_time_minutes_explicit" as const;

/** sort=popular metric owner. */
export const BROWSE_ORGANIC_SORT_POPULAR_METRIC = "completed_orders_30d" as const;
