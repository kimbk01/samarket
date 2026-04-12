-- 증분 동기: 특정 메시지 id 이후 행만 조회 (전체 목록·대량 스캔 방지)
-- (created_at, id) 복합 커서 — 동일 시각 다중 행 대비
create or replace function public.community_messenger_room_messages_after(
  p_user_id uuid,
  p_room_id uuid,
  p_after_message_id uuid,
  p_limit int
)
returns setof public.community_messenger_messages
language sql
stable
security definer
set search_path = public
as $$
  select m.*
  from public.community_messenger_messages m
  where m.room_id = p_room_id
    and exists (
      select 1
      from public.community_messenger_participants p
      where p.room_id = p_room_id
        and p.user_id = p_user_id
    )
    and exists (
      select 1
      from public.community_messenger_messages a
      where a.id = p_after_message_id
        and a.room_id = p_room_id
    )
    and (
      m.created_at,
      m.id
    ) > (
      select a.created_at, a.id
      from public.community_messenger_messages a
      where a.id = p_after_message_id
        and a.room_id = p_room_id
    )
  order by m.created_at asc, m.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

comment on function public.community_messenger_room_messages_after(uuid, uuid, uuid, int) is
  '그룹/방 메시지 증분: p_after_message_id 보다 새 행만 (최대 100행).';

grant execute on function public.community_messenger_room_messages_after(uuid, uuid, uuid, int) to service_role;
