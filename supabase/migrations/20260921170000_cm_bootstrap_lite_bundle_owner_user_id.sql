-- Home room summary: propagate owner_user_id for private_group leave guard (client-side).
-- Extends lite bundle room JSON only; snapshot RPCs inherit via community_messenger_bootstrap_lite_my_rooms_bundle.

create or replace function public.community_messenger_bootstrap_lite_my_rooms_bundle(
  p_user_id uuid,
  p_limit integer default 500
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select
      p.room_id,
      r.id,
      r.room_type,
      r.room_status,
      r.is_readonly,
      r.direct_key,
      r.title,
      r.created_by,
      r.owner_user_id,
      r.last_message,
      r.last_message_at,
      r.last_message_type,
      count(*) over ()::integer as membership_total_count,
      row_number() over (
        order by r.last_message_at desc nulls last, p.room_id asc
      ) as rn
    from public.community_messenger_participants p
    join public.community_messenger_rooms r on r.id = p.room_id
    where p.user_id = p_user_id
      and p.left_at is null
      and p.blocked_hidden_at is null
  ),
  capped as (
    select *
    from ranked
    where rn <= least(greatest(coalesce(p_limit, 500), 0), 500)
  ),
  capped_room_ids as (
    select room_id from capped
  ),
  participant_user_ids as (
    select distinct p.user_id
    from public.community_messenger_participants p
    where p.room_id in (select room_id from capped_room_ids)
    union
    select p_user_id
  ),
  room_arr as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'room_type', c.room_type,
          'room_status', c.room_status,
          'is_readonly', c.is_readonly,
          'direct_key', c.direct_key,
          'title', c.title,
          'created_by', c.created_by,
          'owner_user_id', c.owner_user_id,
          'last_message', c.last_message,
          'last_message_at', c.last_message_at,
          'last_message_type', c.last_message_type
        )
        order by c.last_message_at desc nulls last, c.id asc
      ),
      '[]'::jsonb
    ) as rooms
    from capped c
  ),
  participant_arr as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'room_id', p.room_id,
          'user_id', p.user_id,
          'unread_count', p.unread_count,
          'is_muted', p.is_muted,
          'is_pinned', p.is_pinned,
          'is_archived', p.is_archived
        )
      ),
      '[]'::jsonb
    ) as participants
    from public.community_messenger_participants p
    where p.room_id in (select room_id from capped_room_ids)
  ),
  profile_labels as (
    select coalesce(
      jsonb_object_agg(
        pr.id::text,
        jsonb_build_object(
          'id', pr.id,
          'display_name', pr.display_name,
          'nickname', pr.nickname,
          'username', pr.username,
          'avatar_url', pr.avatar_url
        )
      ),
      '{}'::jsonb
    ) as profiles
    from public.profiles pr
    where pr.id in (select user_id from participant_user_ids)
  )
  select jsonb_build_object(
    'membership_total_count', (select max(membership_total_count) from ranked),
    'room_ids', (select coalesce(jsonb_agg(c.room_id order by c.last_message_at desc nulls last, c.room_id asc), '[]'::jsonb) from capped c),
    'rooms', (select rooms from room_arr),
    'participants', (select participants from participant_arr),
    'profile_labels', (select profiles from profile_labels)
  );
$$;

comment on function public.community_messenger_bootstrap_lite_my_rooms_bundle(uuid, integer) is
  'CM bootstrap lite: active viewer memberships only (left_at / blocked_hidden_at excluded). owner_user_id 포함.';
