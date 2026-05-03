-- Per-recipient message read rows + atomic mark-read RPC (batch INSERT, single participant UPDATE).
-- unread_count is recomputed from missing reads so it stays aligned with message-level state.

create table if not exists public.community_messenger_message_reads (
  message_id uuid not null references public.community_messenger_messages (id) on delete cascade,
  reader_user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, reader_user_id)
);

create index if not exists community_messenger_message_reads_reader_idx
  on public.community_messenger_message_reads (reader_user_id);

comment on table public.community_messenger_message_reads is
  'CM: reader별 메시지 읽음 시각. 미존재 행 = 해당 독자에게 미읽음.';

alter table public.community_messenger_message_reads enable row level security;

-- 직접 테이블 접근 차단 — 서비스 롤·RPC만 사용 (클라에서 직접 INSERT 금지).
drop policy if exists community_messenger_message_reads_deny_all on public.community_messenger_message_reads;
create policy community_messenger_message_reads_deny_all
  on public.community_messenger_message_reads
  for all
  using (false)
  with check (false);

create or replace function public.community_messenger_apply_room_read_mark(
  p_room_id uuid,
  p_reader_id uuid,
  p_mode text,
  p_through_message_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tail_id uuid;
  v_through_created timestamptz;
  v_now timestamptz := now();
  v_unread int;
begin
  if p_room_id is null or p_reader_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_args');
  end if;

  if not exists (
    select 1
    from public.community_messenger_participants p
    where p.room_id = p_room_id and p.user_id = p_reader_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_member');
  end if;

  if p_mode = 'open' then
    select m.id
      into v_tail_id
    from public.community_messenger_messages m
    where m.room_id = p_room_id
      and m.deleted_at is null
    order by m.created_at desc nulls last, m.id desc nulls last
    limit 1;

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

  elsif p_mode = 'cursor' then
    if p_through_message_id is null then
      return jsonb_build_object('ok', false, 'error', 'through_required');
    end if;

    select m.created_at
      into v_through_created
    from public.community_messenger_messages m
    where m.id = p_through_message_id
      and m.room_id = p_room_id
      and m.deleted_at is null;

    if v_through_created is null then
      return jsonb_build_object('ok', false, 'error', 'through_not_found');
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
      and (
        m.created_at < v_through_created
        or (
          m.created_at = v_through_created
          and m.id <= p_through_message_id
        )
      )
    on conflict do nothing;

    v_tail_id := p_through_message_id;

  else
    return jsonb_build_object('ok', false, 'error', 'bad_mode');
  end if;

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

  return jsonb_build_object(
    'ok', true,
    'lastReadMessageId', v_tail_id,
    'lastReadAt', v_now,
    'unreadCount', v_unread
  );
end;
$$;

comment on function public.community_messenger_apply_room_read_mark(uuid, uuid, text, uuid) is
  'CM 읽음: open=방 꼬리까지 일괄 읽음+cursor 맞춤, cursor=through 이전 메시지 배치 읽음. unread_count 재집계.';

grant execute on function public.community_messenger_apply_room_read_mark(uuid, uuid, text, uuid) to service_role;
