-- 텍스트 전송 핫 패스: insert + 방 last + 참가자 unread/읽음 커서를 한 트랜잭션·한 RPC 로 처리해 RTT 왕복을 줄인다.
-- (이미지·스티커 등은 기존 경로 + community_messenger_apply_unread_for_text_message 유지)

create or replace function public.community_messenger_send_text_message(
  p_room_id uuid,
  p_sender_id uuid,
  p_content text,
  p_client_message_id text default null,
  p_created_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.community_messenger_rooms%rowtype;
  v_msg public.community_messenger_messages%rowtype;
  v_existing_id uuid;
  v_trim_client text;
  v_meta jsonb;
  v_recipients jsonb;
begin
  if p_content is null or length(trim(p_content)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'content_required');
  end if;

  select r.*
    into v_room
  from public.community_messenger_rooms r
  inner join public.community_messenger_participants p
    on p.room_id = r.id and p.user_id = p_sender_id
  where r.id = p_room_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  end if;

  if v_room.room_status = 'blocked' then
    return jsonb_build_object('ok', false, 'error', 'room_blocked');
  end if;
  if v_room.room_status = 'archived' then
    return jsonb_build_object('ok', false, 'error', 'room_archived');
  end if;
  if v_room.is_readonly then
    return jsonb_build_object('ok', false, 'error', 'room_readonly');
  end if;

  v_trim_client := nullif(trim(p_client_message_id), '');

  if v_trim_client is not null then
    select m.id
      into v_existing_id
    from public.community_messenger_messages m
    where m.room_id = p_room_id
      and m.sender_id = p_sender_id
      and m.metadata->>'client_message_id' = v_trim_client
    order by m.created_at desc
    limit 1;

    if v_existing_id is not null then
      select * into v_msg from public.community_messenger_messages where id = v_existing_id;

      select coalesce(
        to_jsonb(coalesce(array_agg(user_id::text order by user_id), array[]::text[])),
        '[]'::jsonb
      )
        into v_recipients
      from public.community_messenger_participants
      where room_id = p_room_id and user_id <> p_sender_id;

      return jsonb_build_object(
        'ok', true,
        'deduped', true,
        'message', to_jsonb(v_msg),
        'recipient_user_ids', coalesce(v_recipients, '[]'::jsonb),
        'room_direct_key', to_jsonb(v_room.direct_key)
      );
    end if;
  end if;

  v_meta := case
    when v_trim_client is not null then jsonb_build_object('client_message_id', v_trim_client)
    else '{}'::jsonb
  end;

  insert into public.community_messenger_messages (
    room_id, sender_id, message_type, content, metadata, created_at
  ) values (
    p_room_id, p_sender_id, 'text', trim(p_content), v_meta, p_created_at
  )
  returning * into v_msg;

  update public.community_messenger_rooms
  set
    last_message = trim(p_content),
    last_message_at = p_created_at,
    last_message_type = 'text',
    updated_at = p_created_at
  where id = p_room_id;

  update public.community_messenger_participants p
  set
    unread_count = case
      when p.user_id = p_sender_id then 0
      else coalesce(p.unread_count, 0) + 1
    end,
    last_read_at = case
      when p.user_id = p_sender_id then p_created_at
      else null
    end,
    last_read_message_id = case
      when p.user_id = p_sender_id then v_msg.id
      else p.last_read_message_id
    end
  where p.room_id = p_room_id;

  select coalesce(
    to_jsonb(coalesce(array_agg(user_id::text order by user_id), array[]::text[])),
    '[]'::jsonb
  )
    into v_recipients
  from public.community_messenger_participants
  where room_id = p_room_id and user_id <> p_sender_id;

  return jsonb_build_object(
    'ok', true,
    'deduped', false,
    'message', to_jsonb(v_msg),
    'recipient_user_ids', coalesce(v_recipients, '[]'::jsonb),
    'room_direct_key', to_jsonb(v_room.direct_key)
  );
end;
$$;

comment on function public.community_messenger_send_text_message(uuid, uuid, text, text, timestamptz) is
  'CM 텍스트 전송 단일 트랜잭션: 멤버십·방 상태·dedupe·insert·room last·participant unread/read cursor·수신자 id 목록.';

grant execute on function public.community_messenger_send_text_message(uuid, uuid, text, text, timestamptz) to service_role;
