-- 메신저 메시지: 답장 컬럼, 전원 삭제 시각, 나만 숨김, 반응 + 텍스트 RPC 답장 인자

-- ---------------------------------------------------------------------------
-- 1) messages 컬럼
-- ---------------------------------------------------------------------------
alter table public.community_messenger_messages
  add column if not exists reply_to_message_id uuid null
    references public.community_messenger_messages (id) on delete set null;

alter table public.community_messenger_messages
  add column if not exists reply_preview_text text not null default '';

alter table public.community_messenger_messages
  add column if not exists reply_preview_type text not null default '';

alter table public.community_messenger_messages
  add column if not exists reply_sender_label_snapshot text not null default '';

alter table public.community_messenger_messages
  add column if not exists deleted_for_everyone_at timestamptz null;

comment on column public.community_messenger_messages.reply_to_message_id is
  '답장 대상 메시지 id — 원본 전원 삭제 시 null(set null).';
comment on column public.community_messenger_messages.deleted_for_everyone_at is
  '전원 삭제 시각 — 설정 시 content 비움·UI placeholder. deleted_at 은 행 제거/레거시용으로 유지.';

create index if not exists community_messenger_messages_reply_to_idx
  on public.community_messenger_messages (reply_to_message_id)
  where reply_to_message_id is not null;

create index if not exists community_messenger_messages_deleted_for_everyone_idx
  on public.community_messenger_messages (room_id, deleted_for_everyone_at)
  where deleted_for_everyone_at is not null;

-- ---------------------------------------------------------------------------
-- 2) 나에게만 숨김
-- ---------------------------------------------------------------------------
create table if not exists public.community_messenger_message_user_hides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.community_messenger_messages (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index if not exists community_messenger_message_user_hides_message_idx
  on public.community_messenger_message_user_hides (message_id);

alter table public.community_messenger_message_user_hides enable row level security;

drop policy if exists community_messenger_message_user_hides_select on public.community_messenger_message_user_hides;
create policy community_messenger_message_user_hides_select
  on public.community_messenger_message_user_hides
  for select
  using (auth.uid() = user_id);

drop policy if exists community_messenger_message_user_hides_mutate_own on public.community_messenger_message_user_hides;
create policy community_messenger_message_user_hides_mutate_own
  on public.community_messenger_message_user_hides
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3) 반응
-- ---------------------------------------------------------------------------
create table if not exists public.community_messenger_message_reactions (
  message_id uuid not null references public.community_messenger_messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction_key text not null check (char_length(trim(reaction_key)) > 0 and char_length(reaction_key) <= 32),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction_key)
);

create index if not exists community_messenger_message_reactions_room_agg_idx
  on public.community_messenger_message_reactions (message_id);

alter table public.community_messenger_message_reactions enable row level security;

drop policy if exists community_messenger_message_reactions_select on public.community_messenger_message_reactions;
create policy community_messenger_message_reactions_select
  on public.community_messenger_message_reactions
  for select
  using (
    exists (
      select 1
      from public.community_messenger_participants p
      inner join public.community_messenger_messages m on m.room_id = p.room_id and m.id = community_messenger_message_reactions.message_id
      where p.user_id = auth.uid()
    )
  );

drop policy if exists community_messenger_message_reactions_mutate_own on public.community_messenger_message_reactions;
create policy community_messenger_message_reactions_mutate_own
  on public.community_messenger_message_reactions
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.community_messenger_participants p
      inner join public.community_messenger_messages m on m.room_id = p.room_id and m.id = community_messenger_message_reactions.message_id
      where p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.community_messenger_participants p
      inner join public.community_messenger_messages m on m.room_id = p.room_id and m.id = community_messenger_message_reactions.message_id
      where p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4) 텍스트 전송 RPC — 답장 인자 + 스냅샷 검증
-- ---------------------------------------------------------------------------
drop function if exists public.community_messenger_send_text_message(uuid, uuid, text, text, timestamptz);

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
    select pc.seller_id, pc.buyer_id, pc.seller_left_at, pc.buyer_left_at
      into v_pc_seller, v_pc_buyer, v_seller_left, v_buyer_left
    from public.product_chats pc
    where pc.community_messenger_room_id = p_room_id
    limit 1;

    if v_pc_seller is not null then
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
  'CM 텍스트 전송: 멤버십·방 상태·거래 가드·dedupe·답장 스냅샷·insert·last·unread.';

grant execute on function public.community_messenger_send_text_message(uuid, uuid, text, text, timestamptz, uuid) to service_role;
