/**
 * Flip to `true` only after Production has applied
 * `supabase/migrations/20261120140000_store_orders_serviceability_snapshot.sql`
 * (or successor). Do NOT infer readiness from PostgREST 42703.
 */
export const STORE_ORDER_SERVICEABILITY_SNAPSHOT_READY = false;
