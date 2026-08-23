/**
 * P1-B discovery — platform popular **product** metric authority (not store order count).
 *
 * STORE popular (P1-A): COUNT(completed orders) per store.
 * PRODUCT popular (P1-B): SUM(order line qty) per product within store.
 *
 * Legacy detail single-store RPC (`get_store_popular_product_stats`) uses a different
 * population — do not conflate with this contract.
 */
export const STORE_POPULAR_PRODUCT_STATS_BATCH_RPC = "get_store_popular_product_stats_batch";

/** Discovery population — positive filter only */
export const STORE_POPULAR_PRODUCT_METRIC_POPULATION = "completed_only" as const;

/** Aggregates store_order_items.qty (not COUNT orders) */
export const STORE_POPULAR_PRODUCT_METRIC_UNIT = "sum_quantity" as const;

/** Window filter on store_orders.created_at (no completed_at on store_orders) */
export const STORE_POPULAR_PRODUCT_TIME_AUTHORITY = "store_orders.created_at" as const;

export const STORE_POPULAR_PRODUCT_RANK_ORDER = [
  "total_qty_desc",
  "last_ordered_at_desc",
  "product_id_asc",
] as const;

/** Matches single-store RPC cap — batch per-store limit clamp */
export const STORE_POPULAR_PRODUCT_BATCH_LIMIT_MAX = 50;

export type StorePopularProductMetricPopulation = typeof STORE_POPULAR_PRODUCT_METRIC_POPULATION;
export type StorePopularProductMetricUnit = typeof STORE_POPULAR_PRODUCT_METRIC_UNIT;
