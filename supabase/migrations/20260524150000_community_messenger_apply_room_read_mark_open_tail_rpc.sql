-- Cold PATCH mark_read (flushOpen, unread>0): participant snapshot + open-tail mark in one RTT.
-- Warm duplicate-skip paths stay in app TTL cache; this RPC replaces SELECT + apply_room_read_mark(open).

create or replace function public.community_messenger_apply_room_read_mark_open_tail(
  p_room_id uuid,
  p_reader_id uuid,
  p_client_cursor uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
  v_existing_last_read uuid;
  v_existing_last_at timestamptz;
  v_existing_unread int;
  v_tail_id uuid;
  v_now timestamptz := now();
  v_unread int;
  v_duplicate boolean := false;
  v_advanced boolean := false;
begin
  if p_room_id is null or p_reader_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;

  select
    p.id,
    p.last_read_message_id,
    p.last_read_at,
    coalesce(p.unread_count, 0)
  into
    v_participant_id,
    v_existing_last_read,
    v_existing_last_at,
    v_existing_unread
  from public.community_messenger_participants p
  where p.room_id = p_room_id
    and p.user_id = p_reader_id
  for update;

  if v_participant_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  select m.id
    into v_tail_id
  from public.community_messenger_messages m
  where m.room_id = p_room_id
    and m.deleted_at is null
  order by m.created_at desc nulls last, m.id desc nulls last
  limit 1;

  if p_client_cursor is not null and v_tail_id is not null and p_client_cursor is distinct from v_tail_id then
    if exists (
      select 1
      from public.community_messenger_messages m
      where m.id = p_client_cursor
        and m.room_id = p_room_id
        and m.deleted_at is null
        and (
          m.created_at > (
            select m2.created_at
            from public.community_messenger_messages m2
            where m2.id = v_tail_id
          )
          or (
            m.created_at = (select m2.created_at from public.community_messenger_messages m2 where m2.id = v_tail_id)
            and m.id > v_tail_id
          )
        )
    ) then
      return jsonb_build_object('ok', false, 'error', 'regression_blocked');
    end if;
  end if;

  if v_existing_unread = 0 then
    if v_tail_id is null then
      v_duplicate := true;
    elsif v_existing_last_read is not distinct from v_tail_id then
      v_duplicate := true;
    end if;
  end if;

  if v_duplicate then
    return jsonb_build_object(
      'ok', true,
      'duplicateSkipped', true,
      'lastReadAdvanced', false,
      'lastReadMessageId', v_existing_last_read,
      'lastReadAt', coalesce(v_existing_last_at, v_now),
      'unreadCount', 0,
      'participantId', v_participant_id
    );
  end if;

  insert into public.community_messenger_message_reads (message_id, reader_user_id, read_at)
  select m.id, p_reader_id, v_now
  from public.community_messenger_messages m
  where m.room_id = p_room_id
    and m.deleted_at is null
    and m.sender_id is distinct from p_reader_id
    and not exists (
      select 1
      from public.community_messenger_message_reads r
      where r.message_id = m.id
        and r.reader_user_id = p_reader_id
    )
  on conflict do nothing;

  select count(*)::int
    into v_unread
  from public.community_messenger_messages m
  where m.room_id = p_room_id
    and m.deleted_at is null
    and m.sender_id is distinct from p_reader_id
    and not exists (
      select 1
      from public.community_messenger_message_reads r
      where r.message_id = m.id
        and r.reader_user_id = p_reader_id
    );

  update public.community_messenger_participants p
  set
    unread_count = coalesce(v_unread, 0),
    last_read_message_id = v_tail_id,
    last_read_at = v_now
  where p.room_id = p_room_id
    and p.user_id = p_reader_id;

  v_advanced := true;

  return jsonb_build_object(
    'ok', true,
    'duplicateSkipped', false,
    'lastReadAdvanced', v_advanced,
    'lastReadMessageId', v_tail_id,
    'lastReadAt', v_now,
    'unreadCount', v_unread,
    'participantId', v_participant_id
  );
end;
$$;

comment on function public.community_messenger_apply_room_read_mark_open_tail(uuid, uuid, uuid) is
  'CM cold open-tail mark_read: membership+participant row+tail mark+unread recount in one round trip.';

revoke all on function public.community_messenger_apply_room_read_mark_open_tail(uuid, uuid, uuid) from public;
revoke execute on function public.community_messenger_apply_room_read_mark_open_tail(uuid, uuid, uuid) from anon;
revoke execute on function public.community_messenger_apply_room_read_mark_open_tail(uuid, uuid, uuid) from authenticated;
grant execute on function public.community_messenger_apply_room_read_mark_open_tail(uuid, uuid, uuid) to service_role;
