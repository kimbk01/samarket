-- CM bootstrap round_2: `direct_key` 를 RPC 한 번에 포함해 PostgREST 추가 왕복(attachDirectKeys) 제거.

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
  last_message_type text,
  direct_key text
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
    r.last_message_type,
    r.direct_key
  from public.community_messenger_rooms r
  where r.id = any(coalesce(p_room_ids, '{}'::uuid[]))
  order by r.last_message_at desc nulls last;
$$;

comment on function public.community_messenger_bootstrap_rooms(uuid[]) is
  'CM bootstrap round_2 rooms fetch: 기존 컬럼 + direct_key(거래 원장 키) 포함.';

grant execute on function public.community_messenger_bootstrap_rooms(uuid[]) to service_role;
