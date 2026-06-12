-- trade_post_ads 만료 + pg_cron

BEGIN;

CREATE OR REPLACE FUNCTION public.expire_trade_post_ads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.trade_post_ads') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.trade_post_ads
    SET apply_status = 'expired',
        updated_at = now()
  WHERE apply_status = 'active'
    AND end_at IS NOT NULL
    AND end_at < now();
END;
$$;

REVOKE ALL ON FUNCTION public.expire_trade_post_ads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_trade_post_ads() TO service_role;

COMMIT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire_trade_post_ads';

    PERFORM cron.schedule(
      'expire_trade_post_ads',
      '*/10 * * * *',
      $cron$SELECT public.expire_trade_post_ads();$cron$
    );
    RAISE NOTICE 'expire_trade_post_ads: cron.schedule registered (*/10 * * * *)';
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
END $$;
