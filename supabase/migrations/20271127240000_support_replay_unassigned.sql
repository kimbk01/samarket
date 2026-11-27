-- 고객 문의 SSOT 2차 재감사 (2026-11-27) C·I — admin_notification_replay_support_replies 만 다시 정의.
-- 운영 적용 = Owner 별도 승인. 기준 = 운영 현재 정의(2026-11-27 조회, md5 2e79be46…) — 저장소 20271124120000 과 같음.
--
-- C: 담당자 없는 문의(새 문의의 기본 경로)는 재생 대상이 아니었다 → 앱의 알림 발송(응답 뒤 after)과 outbox 저장이
--    둘 다 실패하면 그 고객 글의 어드민 알림이 끝내 없었다.
--    → 담당자 없음 + 어드민 일 남음(OPEN·WAITING_ADMIN) 이면 support 권한 어드민 전원(broadcastPermission)으로 재생.
-- I: 담당자 재생도 support 권한을 요구(requiredPermission)하고, 보낸 사람 본인은 받지 않는다(excludeRecipientIds).
-- 같은 글 id dedupe 키(support_customer_replied:<글 id>)가 어느 어드민에게든 있으면 건너뛰는 규칙은 그대로.

BEGIN;

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
           c.assigned_admin_id
      from public.support_messages m
      join public.support_cases c on c.id = m.case_id
     where m.message_type = 'PUBLIC'
       and m.sender_type in ('MEMBER', 'OWNER')
       and m.deleted_at is null
       and m.created_at > now() - p_lookback
       and c.status not in ('RESOLVED', 'ARCHIVED')
       and (
         (c.assigned_admin_id is not null and internal.is_platform_admin(c.assigned_admin_id))
         or (c.assigned_admin_id is null and c.status in ('OPEN', 'WAITING_ADMIN'))
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
      'title', '고객 추가 문의 · ' || r.public_case_no,
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

COMMIT;
