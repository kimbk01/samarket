-- Harden privileges on public.business_cash_conversion_rate_history
-- Project: ckdosyydvgzqwpbwuhon
--
-- Historical: table created in 20261201300000 without RLS; public default ACL
-- left anon/authenticated ALL. RLS(+FORCE) was later enabled out-of-band;
-- client table privileges remained.
--
-- This migration is the honest current harden (not a backdated phase9 stand-in):
--   ENABLE + FORCE RLS (idempotent)
--   REVOKE ALL from PUBLIC, anon, authenticated
--   GRANT ALL to service_role
--   No RLS policies (service_role bypasses RLS)
--
-- Scope: this table only.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_cash_conversion_rate_history') IS NULL THEN
    RAISE EXCEPTION
      'business_cash_conversion_rate_history missing — refuse privilege harden';
  END IF;

  ALTER TABLE public.business_cash_conversion_rate_history
    ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.business_cash_conversion_rate_history
    FORCE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE public.business_cash_conversion_rate_history
    FROM PUBLIC, anon, authenticated;

  GRANT ALL ON TABLE public.business_cash_conversion_rate_history
    TO service_role;

  COMMENT ON TABLE public.business_cash_conversion_rate_history IS
    'Business cash conversion rate audit trail. RLS on; service_role API only.';
END $$;

COMMIT;
