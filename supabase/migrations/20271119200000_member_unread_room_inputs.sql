-- D2 2단계 2-a (Owner 「승인」 2026-11-19) — 배지 계산 입력을 쓰기 시점에 유지.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/d2-stage2-design-2026-11-19.md
--
-- 지금 배지 계산(load-unread-participant-room-rows.ts + 거래·주문 로더)이 요청마다 읽는 **입력 그대로**를 방별 1행으로 둔다:
--   참가자: unread_count (> 0, left_at IS NULL 인 행만 — 로더 조회 조건과 같음)
--   방: chat_domain · domain_identity_key · 삭제 여부 · 마지막 메시지 내용 유무(JS trim 기준, 원문 대신 불리언)
--   주문: domain_identity_key 'store_order:{orderId}[:…]'(store_order:room: 제외)의 주문 구매자·매장 / 매장 주인
-- 판정(중복·격리·역할 분리)은 TS 의 기존 partition 함수가 그대로 한다 → 결과 동일. 이 단계는 그림자 비교만(화면 불변).
-- 유지: 참가자 unread_count·left_at 변경(메시지마다 받는 사람 행 1개, 같은 트랜잭션) · 방 삭제/내용 유무 전환 · 매장 주인 변경.

begin;

create table if not exists public.member_unread_room_inputs (
  user_id uuid not null,
  room_id uuid not null,
  unread_count integer not null,
  chat_domain text,
  domain_identity_key text,
  room_deleted boolean not null default false,
  last_message_has_content boolean not null default false,
  order_id text,
  order_buyer_user_id uuid,
  order_store_id uuid,
  store_owner_user_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
create index if not exists member_unread_room_inputs_room_idx on public.member_unread_room_inputs (room_id);
create index if not exists member_unread_room_inputs_store_idx on public.member_unread_room_inputs (order_store_id)
  where order_store_id is not null;

alter table public.member_unread_room_inputs enable row level security;
revoke all on public.member_unread_room_inputs from public, anon, authenticated;
grant select, insert, update, delete on public.member_unread_room_inputs to service_role;

comment on table public.member_unread_room_inputs is
  'D2 stage 2 — per-room badge inputs maintained at write time (same inputs the TS badge loaders read). service_role only.';

-- 방 1개·사용자 1명의 입력 행을 원본에서 다시 쓴다(있으면 갱신, 자격 없으면 삭제)
create or replace function internal.refresh_member_unread_room_input(p_user_id uuid, p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unread integer;
  v_left timestamptz;
  v_room record;
  v_order_id text;
  v_buyer uuid;
  v_store uuid;
  v_owner uuid;
begin
  if p_user_id is null or p_room_id is null then
    return;
  end if;

  select p.unread_count, p.left_at into v_unread, v_left
    from public.community_messenger_participants p
   where p.room_id = p_room_id and p.user_id = p_user_id;

  if not found or coalesce(v_unread, 0) <= 0 or v_left is not null then
    delete from public.member_unread_room_inputs where user_id = p_user_id and room_id = p_room_id;
    return;
  end if;

  select r.chat_domain, r.domain_identity_key, r.deleted_at, r.last_message
    into v_room
    from public.community_messenger_rooms r
   where r.id = p_room_id;

  v_order_id := null; v_buyer := null; v_store := null; v_owner := null;
  if v_room.domain_identity_key like 'store_order:%' and v_room.domain_identity_key not like 'store_order:room:%' then
    v_order_id := nullif(btrim(split_part(substr(v_room.domain_identity_key, length('store_order:') + 1), ':', 1)), '');
    if v_order_id is not null then
      select o.buyer_user_id, o.store_id into v_buyer, v_store
        from public.store_orders o where o.id::text = v_order_id;
      if v_store is not null then
        select st.owner_user_id into v_owner from public.stores st where st.id = v_store;
      end if;
    end if;
  end if;

  insert into public.member_unread_room_inputs as m
    (user_id, room_id, unread_count, chat_domain, domain_identity_key, room_deleted, last_message_has_content,
     order_id, order_buyer_user_id, order_store_id, store_owner_user_id, updated_at)
  values
    (p_user_id, p_room_id, v_unread, v_room.chat_domain, v_room.domain_identity_key, v_room.deleted_at is not null,
     internal.cm_badge_text_has_content(v_room.last_message), v_order_id, v_buyer, v_store, v_owner, now())
  on conflict (user_id, room_id) do update set
    unread_count = excluded.unread_count,
    chat_domain = excluded.chat_domain,
    domain_identity_key = excluded.domain_identity_key,
    room_deleted = excluded.room_deleted,
    last_message_has_content = excluded.last_message_has_content,
    order_id = excluded.order_id,
    order_buyer_user_id = excluded.order_buyer_user_id,
    order_store_id = excluded.order_store_id,
    store_owner_user_id = excluded.store_owner_user_id,
    updated_at = now();
end;
$$;

revoke all on function internal.refresh_member_unread_room_input(uuid, uuid) from public, anon, authenticated;

-- 참가자: 안 읽음 수·나감·사용자/방이 바뀔 때 (메시지마다 받는 사람의 unread_count 증가 포함)
create or replace function internal.trg_member_unread_room_inputs_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.member_unread_room_inputs where user_id = old.user_id and room_id = old.room_id;
    return null;
  end if;
  if tg_op = 'UPDATE' and (old.user_id is distinct from new.user_id or old.room_id is distinct from new.room_id) then
    delete from public.member_unread_room_inputs where user_id = old.user_id and room_id = old.room_id;
  elsif tg_op = 'UPDATE'
        and coalesce(old.unread_count, 0) > 0 and old.left_at is null
        and coalesce(new.unread_count, 0) > 0 and new.left_at is null then
    -- 가장 흔한 경우(메시지마다): 이미 안 읽음인 방의 숫자만 바뀜 → 숫자만 갱신(방·주문 재조회 없음)
    update public.member_unread_room_inputs
       set unread_count = new.unread_count, updated_at = now()
     where user_id = new.user_id and room_id = new.room_id;
    if found then
      return null;
    end if;
  end if;
  perform internal.refresh_member_unread_room_input(new.user_id, new.room_id);
  return null;
end;
$$;

drop trigger if exists trg_member_unread_room_inputs_participants_ins on public.community_messenger_participants;
drop trigger if exists trg_member_unread_room_inputs_participants_upd on public.community_messenger_participants;
drop trigger if exists trg_member_unread_room_inputs_participants_del on public.community_messenger_participants;

create trigger trg_member_unread_room_inputs_participants_ins
after insert on public.community_messenger_participants
for each row
when (coalesce(new.unread_count, 0) > 0 and new.left_at is null)
execute function internal.trg_member_unread_room_inputs_participants();

create trigger trg_member_unread_room_inputs_participants_upd
after update of unread_count, left_at, user_id, room_id on public.community_messenger_participants
for each row
when (
  old.unread_count is distinct from new.unread_count
  or old.left_at is distinct from new.left_at
  or old.user_id is distinct from new.user_id
  or old.room_id is distinct from new.room_id
)
execute function internal.trg_member_unread_room_inputs_participants();

create trigger trg_member_unread_room_inputs_participants_del
after delete on public.community_messenger_participants
for each row
execute function internal.trg_member_unread_room_inputs_participants();

-- 방: 삭제 여부·내용 유무가 바뀔 때만 (chat_domain·domain_identity_key 는 불변 — guard 트리거)
create or replace function internal.trg_member_unread_room_inputs_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_unread_room_inputs m
     set room_deleted = new.deleted_at is not null,
         last_message_has_content = internal.cm_badge_text_has_content(new.last_message),
         updated_at = now()
   where m.room_id = new.id;
  return null;
end;
$$;

drop trigger if exists trg_member_unread_room_inputs_rooms on public.community_messenger_rooms;
create trigger trg_member_unread_room_inputs_rooms
after update of deleted_at, last_message on public.community_messenger_rooms
for each row
when (
  (old.deleted_at is null) is distinct from (new.deleted_at is null)
  or internal.cm_badge_text_has_content(old.last_message)
     is distinct from internal.cm_badge_text_has_content(new.last_message)
)
execute function internal.trg_member_unread_room_inputs_rooms();

-- 매장 주인 변경 (드묾)
create or replace function internal.trg_member_unread_room_inputs_stores()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.member_unread_room_inputs m
     set store_owner_user_id = new.owner_user_id, updated_at = now()
   where m.order_store_id = new.id;
  return null;
end;
$$;

drop trigger if exists trg_member_unread_room_inputs_stores on public.stores;
create trigger trg_member_unread_room_inputs_stores
after update of owner_user_id on public.stores
for each row
when (old.owner_user_id is distinct from new.owner_user_id)
execute function internal.trg_member_unread_room_inputs_stores();

-- 백필: 지금 안 읽은 활성 참여 전부
do $$
declare
  r record;
begin
  for r in
    select p.user_id, p.room_id from public.community_messenger_participants p
     where p.unread_count > 0 and p.left_at is null
  loop
    perform internal.refresh_member_unread_room_input(r.user_id, r.room_id);
  end loop;
end;
$$;

-- 읽기: 서버(service_role)만
create or replace function public.get_member_unread_room_inputs(p_user_id uuid)
returns setof public.member_unread_room_inputs
language sql
stable
security definer
set search_path = public
as $$
  select * from public.member_unread_room_inputs where user_id = p_user_id;
$$;

revoke all on function public.get_member_unread_room_inputs(uuid) from public, anon, authenticated;
grant execute on function public.get_member_unread_room_inputs(uuid) to service_role;

commit;
