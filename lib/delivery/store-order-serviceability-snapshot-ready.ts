/**
 * LOC-004 — order-time serviceability snapshot is written by `create_store_order_atomic` in the SAME
 * INSERT (`supabase/migrations/20270604110100_create_store_order_atomic_ops08_loc004.sql`); the route
 * only puts the `checkout_store_*` / `checkout_serviceability_*` keys into `p_order` (no post-UPDATE).
 * Columns exist in Production (`20261120140000_store_orders_serviceability_snapshot.sql`).
 * Rollback switch: `false` stops sending the keys (orders then keep NULL snapshot, nothing else changes).
 */
export const STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY = true;
