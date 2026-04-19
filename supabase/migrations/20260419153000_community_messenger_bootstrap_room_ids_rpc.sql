-- 홈 lite/full bootstrap round_1 대체: 멤버십 + 최근 활동 정렬 기준을 한 번에 제공한다.
-- 서버 서비스 레이어(`getSupabaseServer` = service_role) 전용이므로 execute 는 service_role 로 한정한다.

create or replace function public.community_messenger_bootstrap_my_room_ids(
  p_user_id uuid,
  p_limit integer default 500
)
returns table (
  room_id uuid,
  last_message_at timestamptz,
  membership_total_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      p.room_id,
      r.last_message_at,
      count(*) over()::integer as membership_total_count
    from public.community_messenger_participants p
    join public.community_messenger_rooms r
      on r.id = p.room_id
    where p.user_id = p_user_id
  )
  select
    ranked.room_id,
    ranked.last_message_at,
    ranked.membership_total_count
  from ranked
  order by ranked.last_message_at desc nulls last, ranked.room_id asc
  limit least(greatest(coalesce(p_limit, 500), 0), 500);
$$;

comment on function public.community_messenger_bootstrap_my_room_ids(uuid, integer) is
  'CM bootstrap round_1 대체: viewer membership room ids를 last_message_at 기준 최근순으로 최대 500개 반환하며 전체 membership 개수도 함께 제공.';

grant execute on function public.community_messenger_bootstrap_my_room_ids(uuid, integer) to service_role;
