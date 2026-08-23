-- CUT 5 — Pin discovery function search_path to include gis (PostGIS).
-- Runtime ST_*/geography resolution. Additive ALTER only.

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'stores_compute_location_geog',
        'trg_stores_sync_location_geog',
        'trg_stores_sync_district_norm',
        'upsert_store_delivery_coverage',
        'apply_store_order_popularity_ledger',
        'expire_store_order_popularity_ledger_batch',
        'upsert_store_order_daily_stat_on_completed',
        'begin_delivery_coverage_global_rebuild',
        'mark_delivery_coverage_rebuild_progress',
        'try_flip_delivery_coverage_active_version',
        'store_discovery_district_tier',
        'store_discovery_active_coverage_policy_version',
        'store_discovery_coverage_origin_covered',
        'get_store_discovery_home_shadow',
        'get_store_discovery_browse_shadow',
        'store_discovery_shadow_in_range',
        'get_store_discovery_shadow_wave',
        'postgis_version'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path TO public, gis, extensions', r.sig);
  END LOOP;
END
$$;

COMMIT;
