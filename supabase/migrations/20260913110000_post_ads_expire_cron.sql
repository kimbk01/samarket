-- post_ads · point_promotion_orders 만료 자동 처리 + pg_cron (있을 때만 등록)

BEGIN;

CREATE OR REPLACE FUNCTION public.expire_post_ads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.post_ads') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.post_ads
    SET apply_status = 'expired',
        is_active = false,
        updated_at = now()
  WHERE apply_status = 'active'
    AND end_at IS NOT NULL
    AND end_at < now();
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_point_promotion_orders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.point_promotion_orders') IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.point_promotion_orders
    SET order_status = 'expired'
  WHERE order_status = 'active'
    AND end_at < now();
END;
$$;

REVOKE ALL ON FUNCTION public.expire_post_ads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_post_ads() TO service_role;

REVOKE ALL ON FUNCTION public.expire_point_promotion_orders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_point_promotion_orders() TO service_role;

COMMIT;

-- Optional scheduler: pg_cron (if available). Safe no-op if extension missing.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire_post_ads';

    PERFORM cron.schedule(
      'expire_post_ads',
      '*/10 * * * *',
      $cron$SELECT public.expire_post_ads();$cron$
    );
    RAISE NOTICE 'expire_post_ads: cron.schedule registered (*/10 * * * *)';

    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'expire_point_promotion_orders';

    PERFORM cron.schedule(
      'expire_point_promotion_orders',
      '*/10 * * * *',
      $cron$SELECT public.expire_point_promotion_orders();$cron$
    );
    RAISE NOTICE 'expire_point_promotion_orders: cron.schedule registered (*/10 * * * *)';
  ELSE
    RAISE NOTICE 'expire_post_ads: pg_cron extension not found — schedule skipped';
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'expire_post_ads: cron tables not available — schedule skipped';
  WHEN undefined_function THEN
    RAISE NOTICE 'expire_post_ads: cron.schedule not available — schedule skipped';
END $$;
