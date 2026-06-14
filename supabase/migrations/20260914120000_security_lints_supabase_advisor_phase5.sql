-- Supabase Security Advisor WARN (splinter export ckdosyydvgzqwpbwuhon) phase 5
--
-- CSV (4) 잔존:
--   0011 function_search_path_mutable — admin_store_orders_buyer_label
--   0028/0029 anon·authenticated SECURITY DEFINER — cron·admin·ads RPC
--
-- 원인: 202609131xxx 마이그레이션이 REVOKE FROM PUBLIC 만 수행.
-- Supabase PostgREST 노출 함수는 anon/authenticated EXECUTE 명시 REVOKE 필요.
--
-- 적용 후 advisor에 의도적으로 남을 수 있음:
--   posts_mask_reserved_buyer_id (anon/authenticated) — posts_masked 뷰
--   is_platform_admin / is_admin_user (authenticated) — RLS
--   auth_leaked_password_protection — Dashboard 수동

BEGIN;

ALTER FUNCTION public.admin_store_orders_buyer_label(text, text, text, uuid)
  SET search_path = public, pg_temp;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        ('admin_can_purge_auth_user(uuid)', false, false),
        ('ensure_community_post_for_post_ads(uuid, uuid)', false, false),
        ('expire_point_promotion_orders()', false, false),
        ('expire_post_ads()', false, false),
        ('expire_trade_post_ads()', false, false),
        ('posts_mask_reserved_buyer_id(uuid)', true, true),
        ('is_platform_admin(uuid)', true, false),
        ('is_admin_user()', true, false)
    ) AS t(sig, grant_authenticated, grant_anon)
  LOOP
    IF to_regprocedure('public.' || r.sig) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', r.sig);

    IF r.grant_anon THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon', r.sig);
    END IF;
    IF r.grant_authenticated THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', r.sig);
  END LOOP;
END $$;

COMMIT;
