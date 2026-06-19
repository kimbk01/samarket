-- Supabase Security Advisor WARN (splinter export ckdosyydvgzqwpbwuhon) phase 6
--
-- CSV (3) 잔존 service_role 전용 RPC — anon/authenticated EXECUTE 명시 REVOKE
--   cleanup_stale_community_messenger_call_sessions (pg_cron — 본문 가드 없음, postgres 실행)
--   community_messenger_group_message_read_counts (group media API)
--   count_notification_events_badge (notify badge API) + auth.uid 가드
--   record_community_post_view (community post view API)
--
-- 적용 후 advisor에 의도적으로 남을 수 있음:
--   posts_mask_reserved_buyer_id (anon/authenticated) — posts_masked security_invoker 뷰
--   is_platform_admin / is_admin_user (authenticated) — RLS 정책 인라인 호출
--   auth_leaked_password_protection — Dashboard → Auth → Password security 수동 활성화

BEGIN;

-- ---------------------------------------------------------------------------
-- count_notification_events_badge — service_role API + 당사자만 (방어 깊이)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.count_notification_events_badge(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT auth.role()) <> 'service_role'
         AND (auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id)
      THEN jsonb_build_object(
        'chat', 0,
        'group', 0,
        'trade', 0,
        'store', 0,
        'missed_call', 0
      )
    ELSE jsonb_build_object(
      'chat',
      COALESCE(
        (SELECT COUNT(*)::int FROM public.notification_events e
         WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
           AND e.category = 'chat'),
        0
      ),
      'group',
      COALESCE(
        (SELECT COUNT(*)::int FROM public.notification_events e
         WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
           AND e.category = 'group'),
        0
      ),
      'trade',
      COALESCE(
        (SELECT COUNT(*)::int FROM public.notification_events e
         WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
           AND e.category = 'trade'),
        0
      ),
      'store',
      COALESCE(
        (SELECT COUNT(*)::int FROM public.notification_events e
         WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
           AND e.category = 'store'),
        0
      ),
      'missed_call',
      COALESCE(
        (SELECT COUNT(*)::int FROM public.notification_events e
         WHERE e.user_id = p_user_id AND e.unread = true AND e.read_at IS NULL
           AND e.category = 'missed_call'),
        0
      )
    )
  END;
$$;

COMMENT ON FUNCTION public.count_notification_events_badge(uuid) IS
  '알림 뱃지 집계 — service_role API 전용. anon/authenticated RPC 금지.';

-- ---------------------------------------------------------------------------
-- EXECUTE 권한 정리 — PUBLIC·anon·authenticated 차단, service_role only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (
      VALUES
        ('cleanup_stale_community_messenger_call_sessions()'),
        ('community_messenger_group_message_read_counts(uuid, uuid[])'),
        ('count_notification_events_badge(uuid)'),
        ('record_community_post_view(uuid, uuid, text)')
    ) AS t(sig)
  LOOP
    IF to_regprocedure('public.' || r.sig) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', r.sig);
  END LOOP;
END $$;

COMMIT;
