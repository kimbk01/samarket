-- 거래 CM 방: product_chats 의 trade_flow_status·chat_mode 로 일반 텍스트 전송 차단(판매자 거래완료 처리 이후 등).

drop function if exists public.community_messenger_send_text_message(uuid, uuid, text, text, timestamptz, uuid);

create or replace function public.community_messenger_send_text_message(
  p_room_id uuid,
  p_sender_id uuid,
  p_content text,
  p_client_message_id text default null,
  p_created_at timestamptz default now(),
  p_reply_to_message_id uuid default null
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
  v_pc_seller uuid;
  v_pc_buyer uuid;
  v_seller_left timestamptz;
  v_buyer_left timestamptz;
  v_pc_flow text;
  v_pc_mode text;
  v_reply_row public.community_messenger_messages%rowtype;
  v_reply_preview text;
  v_reply_type text;
  v_reply_label text;
  v_reply_sender uuid;
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

  IF NOT FOUND THEN
    return jsonb_build_object('ok', false, 'error', 'room_not_found');
  END IF;

  if v_room.room_status = 'blocked' then
    return jsonb_build_object('ok', false, 'error', 'room_blocked');
  end if;
  if v_room.room_status = 'archived' then
    return jsonb_build_object('ok', false, 'error', 'room_archived');
  end if;
  if v_room.is_readonly then
    return jsonb_build_object('ok', false, 'error', 'room_readonly');
  end if;

  if to_regclass('public.product_chats') is not null then
    select
      pc.seller_id,
      pc.buyer_id,
      pc.seller_left_at,
      pc.buyer_left_at,
      lower(coalesce(nullif(trim(pc.trade_flow_status::text), ''), 'chatting')),
      lower(coalesce(nullif(trim(pc.chat_mode::text), ''), 'open'))
    into v_pc_seller, v_pc_buyer, v_seller_left, v_buyer_left, v_pc_flow, v_pc_mode
    from public.product_chats pc
    where pc.community_messenger_room_id = p_room_id
    limit 1;

    if v_pc_seller is not null then
      if v_pc_mode in ('limited', 'readonly') then
        return jsonb_build_object('ok', false, 'error', 'trade_chat_mode_locked');
      end if;
      if coalesce(v_pc_flow, 'chatting') <> 'chatting' then
        return jsonb_build_object('ok', false, 'error', 'trade_flow_not_chatting');
      end if;
      if p_sender_id = v_pc_seller and v_seller_left is not null then
        return jsonb_build_object('ok', false, 'error', 'trade_sender_left');
      end if;
      if p_sender_id = v_pc_buyer and v_buyer_left is not null then
        return jsonb_build_object('ok', false, 'error', 'trade_sender_left');
      end if;
      if p_sender_id = v_pc_buyer and v_seller_left is not null then
        return jsonb_build_object('ok', false, 'error', 'trade_seller_closed');
      end if;
    end if;
  end if;

  v_reply_preview := '';
  v_reply_type := '';
  v_reply_label := '';
  if p_reply_to_message_id is not null then
    select m.* into v_reply_row
    from public.community_messenger_messages m
    where m.id = p_reply_to_message_id
      and m.room_id = p_room_id
      and m.deleted_at is null
    limit 1;
    IF NOT FOUND THEN
      return jsonb_build_object('ok', false, 'error', 'reply_target_not_found');
    END IF;
    if v_reply_row.message_type = 'system' then
      return jsonb_build_object('ok', false, 'error', 'reply_target_invalid');
    end if;
    v_reply_type := coalesce(nullif(trim(v_reply_row.message_type), ''), 'text');
    v_reply_sender := v_reply_row.sender_id;
    if v_reply_sender is not null then
      select coalesce(nullif(trim(pr.nickname), ''), nullif(trim(pr.username), ''), '사용자')
        into v_reply_label
      from public.profiles pr
      where pr.id = v_reply_sender;
    else
      v_reply_label := '시스템';
    end if;
    if v_reply_label is null then
      v_reply_label := '사용자';
    end if;
    if v_reply_row.deleted_for_everyone_at is not null then
      v_reply_preview := '삭제된 메시지';
    elsif v_reply_type = 'text' then
      v_reply_preview := left(trim(coalesce(v_reply_row.content, '')), 280);
    else
      v_reply_preview := '(' || v_reply_type || ')';
    end if;
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
    room_id,
    sender_id,
    message_type,
    content,
    metadata,
    created_at,
    reply_to_message_id,
    reply_preview_text,
    reply_preview_type,
    reply_sender_label_snapshot
  ) values (
    p_room_id,
    p_sender_id,
    'text',
    trim(p_content),
    v_meta,
    p_created_at,
    case when p_reply_to_message_id is not null then p_reply_to_message_id else null end,
    coalesce(v_reply_preview, ''),
    coalesce(v_reply_type, ''),
    coalesce(v_reply_label, '')
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

comment on function public.community_messenger_send_text_message(uuid, uuid, text, text, timestamptz, uuid) is
  'CM 텍스트 전송: 멤버십·방 상태·거래 가드(trade_flow·chat_mode)·dedupe·답장·insert·last·unread.';

grant execute on function public.community_messenger_send_text_message(uuid, uuid, text, text, timestamptz, uuid) to service_role;
