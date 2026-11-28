-- 되돌리기 전용 — 20271129100000_support_full_fix.sql 을 되돌린다. supabase/rollback/ 폴더 = 자동 마이그레이션 대상이 아니다(수동 실행 · Owner 승인).
-- 순서: 웹을 먼저 되돌린다(새 웹은 support_open_case · support_transition_case · jsonb 반환 support_append_message 를 쓴다) → 이 파일.
-- 데이터: support_messages.client_request_id 값은 지운다(되돌린 웹은 쓰지 않는다). 문의·글·사건 행은 그대로.


BEGIN;

-- 4)·3) 새 함수 삭제
DROP FUNCTION IF EXISTS public.support_transition_case(uuid, text, uuid, timestamptz, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.support_open_case(uuid, text, uuid, text, text, text, text, text, text, text, text, integer, text, text, boolean, text, jsonb, uuid);

-- 2) support_append_message = 20271127250000 정의(7개 인자 · support_messages 반환)로
DROP FUNCTION IF EXISTS public.support_append_message(uuid, text, uuid, uuid, text, text, boolean, uuid);
CREATE OR REPLACE FUNCTION public.support_append_message(
  p_case_id uuid,
  p_sender_type text,
  p_sender_user_id uuid,
  p_sender_admin_id uuid,
  p_message_type text,
  p_body text,
  p_system_seed boolean DEFAULT false
)
RETURNS public.support_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_msg public.support_messages;
  v_now timestamptz;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.support_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support_case_not_found' USING ERRCODE = 'P0002';
  END IF;
  v_now := clock_timestamp();
  IF p_message_type = 'PUBLIC' AND v_status IN ('RESOLVED', 'ARCHIVED') THEN
    RAISE EXCEPTION 'support_case_closed' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.support_messages (
    case_id, sender_type, sender_user_id, sender_admin_id, message_type, body, created_at
  ) VALUES (
    p_case_id, p_sender_type, p_sender_user_id, p_sender_admin_id, p_message_type, p_body, v_now
  )
  RETURNING * INTO v_msg;
  IF p_sender_type = 'ADMIN' AND p_message_type = 'PUBLIC' THEN
    UPDATE public.support_cases
       SET status = 'WAITING_USER',
           requester_unread_count = requester_unread_count + 1,
           first_admin_response_at = COALESCE(first_admin_response_at, v_now),
           last_message_at = GREATEST(last_message_at, v_now),
           updated_at = v_now
     WHERE id = p_case_id;
  ELSIF p_sender_type IN ('MEMBER', 'OWNER') AND NOT COALESCE(p_system_seed, false) THEN
    UPDATE public.support_cases
       SET status = 'WAITING_ADMIN',
           admin_unread_count = admin_unread_count + 1,
           last_message_at = GREATEST(last_message_at, v_now),
           updated_at = v_now
     WHERE id = p_case_id;
  ELSIF p_message_type = 'PUBLIC' THEN
    UPDATE public.support_cases
       SET last_message_at = GREATEST(last_message_at, v_now),
           updated_at = v_now
     WHERE id = p_case_id;
  ELSE
    UPDATE public.support_cases
       SET updated_at = v_now
     WHERE id = p_case_id;
  END IF;
  RETURN v_msg;
END;
$$;
REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_append_message(uuid, text, uuid, uuid, text, text, boolean) TO service_role;

-- 1) 요청 id 열·인덱스
DROP INDEX IF EXISTS public.uq_support_messages_client_request_id;
ALTER TABLE public.support_messages DROP COLUMN IF EXISTS client_request_id;

-- 5) 인덱스
DROP INDEX IF EXISTS public.idx_admin_notifications_dedupe_key;

-- 6) 재생 SQL = 20271127240000 정의 그대로 (담당자 판정 internal.is_platform_admin)
CREATE OR REPLACE FUNCTION public.admin_notification_replay_support_replies(p_lookback interval DEFAULT '72:00:00'::interval, p_limit integer DEFAULT 200)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count integer := 0;
  r record;
  v_payload jsonb;
begin
  for r in
    select m.id as message_id, m.body, m.sender_user_id, c.id as case_id, c.public_case_no,
           c.assigned_admin_id,
           -- 3차 재감사 3: 그 문의의 첫 고객 글이면 「새 고객 문의」, 아니면 「고객 추가 문의」 (앱 문구와 같게)
           not exists (
             select 1 from public.support_messages p
              where p.case_id = m.case_id
                and p.message_type = 'PUBLIC'
                and p.sender_type in ('MEMBER', 'OWNER')
                and p.created_at < m.created_at
           ) as is_first
      from public.support_messages m
      join public.support_cases c on c.id = m.case_id
     where m.message_type = 'PUBLIC'
       and m.sender_type in ('MEMBER', 'OWNER')
       and m.deleted_at is null
       and m.created_at > now() - p_lookback
       -- 3차 재감사 1: 어드민 일이 남은 문의만(OPEN·WAITING_ADMIN) — 이미 답했거나(WAITING_USER) 끝난 문의는 재생하지 않는다
       --   (앱의 응답 뒤 발송도 같은 조건으로 건너뛴다 — 둘이 같아야 끝난 일에 미읽음 알림이 다시 생기지 않는다)
       and c.status in ('OPEN', 'WAITING_ADMIN')
       and (
         (c.assigned_admin_id is not null and internal.is_platform_admin(c.assigned_admin_id))
         or c.assigned_admin_id is null
       )
       -- 2026-11-24: 어느 관리자에게든 이미 알림이 있으면 재생하지 않는다 (담당 변경 시 과거 메시지 재알림 방지)
       and not exists (
         select 1 from public.admin_notifications n
          where n.dedupe_key = 'support_customer_replied:' || m.id::text
       )
       and not exists (
         select 1 from public.notification_events e
          where c.assigned_admin_id is not null
            and e.user_id = c.assigned_admin_id
            and e.dedupe_key = 'support_customer_replied:' || m.id::text
       )
       and not exists (
         select 1 from public.admin_notification_outbox o
          where o.source_key = 'support_customer_replied:' || m.id::text
       )
     order by m.created_at
     limit greatest(1, least(p_limit, 1000))
  loop
    v_payload := jsonb_build_object(
      'kind', 'support_customer_replied',
      'title', case when r.is_first then '새 고객 문의 · ' else '고객 추가 문의 · ' end || r.public_case_no,
      'body', left(r.body, 500),
      'linkUrl', '/admin/support/' || r.case_id::text,
      'workRef', jsonb_build_object('table', 'support_cases', 'id', r.case_id),
      'dedupeKey', 'support_customer_replied:' || r.message_id::text,
      'actorUserId', r.sender_user_id,
      'requiredPermission', 'support',
      'excludeRecipientIds', jsonb_build_array(r.sender_user_id),
      'push', true
    );
    if r.assigned_admin_id is not null then
      v_payload := v_payload || jsonb_build_object('recipientAdminIds', jsonb_build_array(r.assigned_admin_id));
    else
      v_payload := v_payload || jsonb_build_object('broadcastPermission', 'support');
    end if;

    if public.admin_notification_outbox_enqueue(
      'support_customer_replied:' || r.message_id::text,
      'support_customer_replied',
      v_payload,
      null
    ) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$function$;

-- 7) admin_notifications 실시간 등록 되돌리기
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'admin_notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_notifications';
  END IF;
END $$;

COMMIT;
