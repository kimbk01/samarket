-- 2026-11-22 메시지 보내기 3b (Owner 「승인·실기 후 반영」) — 채팅 푸시 배지(앱 아이콘 A)용 안 읽은 알림 행을 여러 사람 1번에.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/message-send-fanout-stage3b-badge-design-2026-11-22.md
--
-- 앱 코드 `loadBellExplainUnreadEventRows` 와 **같은 조건·같은 정렬·같은 상한**을 사람마다 적용한다:
--   user_id = 그 사람 · unread = true · read_at is null · created_at 내림차순 · 최대 p_limit(1~2000, 기본 2000)
--   같은 열(id, type, category, display_payload, room_id, dedupe_key, unread, read_at, muted_snapshot).
-- 색인 idx_notification_events_user_unread (user_id, created_at desc) where unread and read_at is null 을 사람마다 쓴다.
-- 권한: SECURITY INVOKER · service_role 전용.

create or replace function public.notification_bell_unread_rows_many(
  p_user_ids uuid[],
  p_limit integer default 2000
)
returns table (user_id uuid, rows jsonb)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select u.uid as user_id,
         coalesce((
           select jsonb_agg(to_jsonb(r) - 'created_at' order by r.created_at desc)
           from (
             select e.id, e.type, e.category, e.display_payload, e.room_id, e.dedupe_key,
                    e.unread, e.read_at, e.muted_snapshot, e.created_at
             from public.notification_events e
             where e.user_id = u.uid and e.unread = true and e.read_at is null
             order by e.created_at desc
             limit greatest(1, least(2000, coalesce(p_limit, 2000)))
           ) r
         ), '[]'::jsonb) as rows
  from (select distinct x as uid from unnest(coalesce(p_user_ids, '{}'::uuid[])) as x where x is not null) u
$$;

revoke all on function public.notification_bell_unread_rows_many(uuid[], integer) from public, anon, authenticated;
grant execute on function public.notification_bell_unread_rows_many(uuid[], integer) to service_role;
