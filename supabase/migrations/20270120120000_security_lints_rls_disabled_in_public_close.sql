-- Supabase Security Advisor — rls_disabled_in_public close
-- Project: ckdosyydvgzqwpbwuhon
--
-- Live audit (2026-09-23): only two public tables had RLS off with
-- anon/authenticated full CRUD:
--   public.store_delivery_service_areas
--   public.store_order_stock_restore_claims
--
-- Both are service_role / SECURITY DEFINER paths only:
--   - delivery areas: tryGetSupabaseForStores() (service role) API routes
--   - stock restore claims: restore_store_order_stock_atomic (service_role gated)
--
-- Harden (same pattern as business_cash_conversion_rate_history):
--   ENABLE + FORCE RLS
--   REVOKE ALL from PUBLIC, anon, authenticated
--   GRANT ALL to service_role
--   No client policies (service_role bypasses RLS)

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.store_delivery_service_areas') IS NULL THEN
    RAISE EXCEPTION
      'store_delivery_service_areas missing — refuse rls_disabled close';
  END IF;

  ALTER TABLE public.store_delivery_service_areas
    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.store_delivery_service_areas
    FORCE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE public.store_delivery_service_areas
    FROM PUBLIC, anon, authenticated;

  GRANT ALL ON TABLE public.store_delivery_service_areas
    TO service_role;

  COMMENT ON TABLE public.store_delivery_service_areas IS
    'Owner/Admin selected delivery LGUs. RLS on; service_role API only.';
END $$;

DO $$
BEGIN
  IF to_regclass('public.store_order_stock_restore_claims') IS NULL THEN
    RAISE EXCEPTION
      'store_order_stock_restore_claims missing — refuse rls_disabled close';
  END IF;

  ALTER TABLE public.store_order_stock_restore_claims
    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.store_order_stock_restore_claims
    FORCE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE public.store_order_stock_restore_claims
    FROM PUBLIC, anon, authenticated;

  GRANT ALL ON TABLE public.store_order_stock_restore_claims
    TO service_role;

  COMMENT ON TABLE public.store_order_stock_restore_claims IS
    'DIBAY Delivery CUT 3: one stock restore claim per order. RLS on; service_role / SECURITY DEFINER only.';
END $$;

COMMIT;
