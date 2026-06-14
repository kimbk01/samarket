-- Supabase Security Advisor WARN (splinter export ckdosyydvgzqwpbwuhon) phase 3
--
-- 전제: 20260912140000 (phase2) — confirm_dibay_id / send_text auth 가드 + PUBLIC·anon REVOKE
-- phase3: 앱이 service_role(API·getSupabaseServer)만 쓰는 RPC에서 authenticated EXECUTE 제거
--
-- 적용 후 advisor에 의도적으로 남을 수 있음:
--   posts_mask_reserved_buyer_id (anon/authenticated) — posts_masked security_invoker 뷰
--   is_platform_admin / is_admin_user (authenticated) — RLS 정책 인라인 호출
--   auth_leaked_password_protection — Dashboard → Auth → Password security 수동 활성화

BEGIN;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        -- service_role API 전용 (dibay-id confirm route)
        ('confirm_dibay_id(uuid, text)', false, false),
        -- sendCommunityMessengerMessage → getSupabaseServer() only
        (
          'community_messenger_send_text_message(uuid, uuid, text, text, timestamp with time zone, uuid)',
          false,
          false
        ),
        -- home-sync API → getSupabaseServer() only
        ('home_sync_direct_keys_critical_bundle(uuid[], uuid[])', false, false),
        ('home_sync_direct_keys_item_trade_rows(uuid[])', false, false),
        -- posts_masked 뷰 — invoker가 함수 호출 (lint 잔존 허용)
        ('posts_mask_reserved_buyer_id(uuid)', true, true),
        -- RLS 보조 — REST RPC lint 잔존 허용
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
