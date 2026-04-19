create or replace function public.community_messenger_bootstrap_rooms(
  p_room_ids uuid[]
)
returns table (
  id uuid,
  room_type text,
  room_status text,
  is_readonly boolean,
  title text,
  summary text,
  avatar_url text,
  last_message text,
  last_message_at timestamptz,
  last_message_type text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.id,
    r.room_type,
    r.room_status,
    r.is_readonly,
    r.title,
    r.summary,
    r.avatar_url,
    r.last_message,
    r.last_message_at,
    r.last_message_type
  from public.community_messenger_rooms r
  where r.id = any(coalesce(p_room_ids, '{}'::uuid[]))
  order by r.last_message_at desc nulls last;
$$;

comment on function public.community_messenger_bootstrap_rooms(uuid[]) is
  'CM bootstrap round_2 rooms fetch 대체: room id 집합에 대해 기존 select 컬럼과 last_message_at desc 정렬을 그대로 반환.';

grant execute on function public.community_messenger_bootstrap_rooms(uuid[]) to service_role;
