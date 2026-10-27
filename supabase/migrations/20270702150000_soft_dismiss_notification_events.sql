-- D-7 (docs/audit/notification-full-reaudit-2026-10-27.md, P-10)
-- 알림센터 삭제(개별·선택·읽은 알림·전체)는 대상 행마다 select + update 를 반복했다(전체 삭제 시 최대 수천 왕복,
-- 행 단위 JSON 덮어쓰기). 대상 선택은 TS 단일 판정(회원 A)에 그대로 두고, 쓰기만 한 문장으로 바꾼다.
-- 계약 DELETE WITHOUT READ: unread / read_at / opened_at 은 바꾸지 않고 display_payload 에 deleted_at·inbox_dismissed_at 만 기록.
-- 실행 권한: service_role 만 (API 는 서버에서 사용자 id 를 확인한 뒤 호출).
-- Rollback: DROP FUNCTION public.soft_dismiss_notification_events(uuid, uuid[]);

BEGIN;

CREATE OR REPLACE FUNCTION public.soft_dismiss_notification_events(
  p_user_id uuid,
  p_ids uuid[]
)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH stamp AS (
    SELECT to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) AS at
  ),
  done AS (
    UPDATE public.notification_events ne
    SET display_payload =
      coalesce(ne.display_payload, '{}'::jsonb)
      || jsonb_build_object('deleted_at', (SELECT at FROM stamp), 'inbox_dismissed_at', (SELECT at FROM stamp))
    WHERE ne.user_id = p_user_id
      AND ne.id = ANY (p_ids)
    RETURNING 1
  )
  SELECT count(*)::integer FROM done;
$$;

REVOKE ALL ON FUNCTION public.soft_dismiss_notification_events(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soft_dismiss_notification_events(uuid, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soft_dismiss_notification_events(uuid, uuid[]) TO service_role;

COMMIT;
