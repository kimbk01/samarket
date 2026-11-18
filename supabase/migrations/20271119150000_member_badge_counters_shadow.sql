-- D2 1단계 (Owner 「D2 승인」 2026-11-19) — 회원 배지 B(안 읽은 대화 수) 쓰기 시점 카운터 · **비교(그림자) 단계**.
-- 설계: docs/audit/supabase-request-surge-2026-11-18/d2-d3-d9-structure-analysis-2026-11-19.md D2
--
-- 정의 = 현재 TS 로더(L)와 같은 규칙 (lib/notifications/load-unread-participant-room-rows.ts ·
--   load-messenger-unread-room-facts-from-participants.ts · load-trade-store-order-unread-room-facts-from-participants.ts):
--   participants.unread_count > 0 AND left_at IS NULL AND rooms.deleted_at IS NULL
--   AND last_message 이 JS trim() 기준 비어 있지 않음
--   · chat_domain general_direct / group / trade → 각 방 수
--   · store_order: domain_identity_key 'store_order:{orderId}[:...]'(store_order:room: 제외) → store_orders.buyer_user_id = 나 → customer
--     (buyer 우선) 아니면 stores.owner_user_id = 나 → owner, 둘 다 아니면 제외
-- 유지 방식: ±1 증감이 아니라 **영향받은 사용자의 값을 위 규칙으로 다시 센다**(정의 그대로 · 누적 오차 없음).
-- 다시 세는 때: 안 읽음 0↔1+ · left_at · 방 삭제 · 빈 메시지↔첫 메시지 전환뿐(메시지마다 아님).
-- chat_domain · domain_identity_key 는 운영에서 불변(guard_community_messenger_rooms_domain_immutable).
-- 이 단계는 화면 숫자를 바꾸지 않는다 — badge-count 가 일부 요청에서 기존 계산과 비교 기록만 한다.

begin;

create table if not exists public.member_badge_counters (
  user_id uuid primary key,
  b_general_direct integer not null default 0,
  b_group integer not null default 0,
  b_trade integer not null default 0,
  b_customer_order integer not null default 0,
  b_owner_order integer not null default 0,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.member_badge_counters enable row level security;
revoke all on public.member_badge_counters from public, anon, authenticated;
grant select, insert, update, delete on public.member_badge_counters to service_role;

comment on table public.member_badge_counters is
  'D2 — member badge B write-time counters (shadow phase). Same rules as TS loaders (L). Maintained by triggers; service_role read.';

-- JS String.prototype.trim() 공백 집합: WhiteSpace(9,B,C,20,A0,1680,2000-200A,202F,205F,3000,FEFF) + LineTerminator(A,D,2028,2029)
create or replace function internal.cm_badge_text_has_content(p text)
returns boolean
language sql
immutable
as $$
  select p is not null
     and p ~ '[^\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
$$;

create or replace function internal.recompute_member_badge_counters(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gd integer := 0;
  v_group integer := 0;
  v_trade integer := 0;
  v_customer integer := 0;
  v_owner integer := 0;
begin
  if p_user_id is null then
    return;
  end if;

  with elig as (
    select r.id as room_id, r.chat_domain, r.domain_identity_key as k
    from public.community_messenger_participants p
    join public.community_messenger_rooms r on r.id = p.room_id
    where p.user_id = p_user_id
      and p.unread_count > 0
      and p.left_at is null
      and r.deleted_at is null
      and internal.cm_badge_text_has_content(r.last_message)
  ),
  so as (
    select e.room_id,
           split_part(substr(e.k, length('store_order:') + 1), ':', 1) as order_id
    from elig e
    where e.chat_domain = 'store_order'
      and e.k like 'store_order:%'
      and e.k not like 'store_order:room:%'
  ),
  so_role as (
    select s.room_id,
           case
             when o.buyer_user_id = p_user_id then 'customer'
             when st.owner_user_id = p_user_id then 'owner'
             else null
           end as role
    from so s
    left join public.store_orders o on o.id::text = s.order_id
    left join public.stores st on st.id = o.store_id
    where s.order_id <> ''
  )
  select
    (select count(*) from elig where btrim(chat_domain) = 'general_direct'),
    (select count(*) from elig where btrim(chat_domain) = 'group'),
    (select count(*) from elig where chat_domain = 'trade'),
    (select count(*) from so_role where role = 'customer'),
    (select count(*) from so_role where role = 'owner')
  into v_gd, v_group, v_trade, v_customer, v_owner;

  insert into public.member_badge_counters as m
    (user_id, b_general_direct, b_group, b_trade, b_customer_order, b_owner_order, version, updated_at)
  values (p_user_id, v_gd, v_group, v_trade, v_customer, v_owner, 1, now())
  on conflict (user_id) do update
    set b_general_direct = excluded.b_general_direct,
        b_group = excluded.b_group,
        b_trade = excluded.b_trade,
        b_customer_order = excluded.b_customer_order,
        b_owner_order = excluded.b_owner_order,
        version = m.version + 1,
        updated_at = now()
    where (m.b_general_direct, m.b_group, m.b_trade, m.b_customer_order, m.b_owner_order)
      is distinct from (excluded.b_general_direct, excluded.b_group, excluded.b_trade,
                        excluded.b_customer_order, excluded.b_owner_order);
end;
$$;

revoke all on function internal.recompute_member_badge_counters(uuid) from public, anon, authenticated;

-- participants: 이 행의 자격(안 읽음>0 · 나가지 않음)이 바뀔 때만 — WHEN 으로 거르므로 메시지마다 함수가 불리지 않는다
create or replace function internal.trg_member_badge_counters_participants()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform internal.recompute_member_badge_counters(old.user_id);
    return null;
  end if;
  perform internal.recompute_member_badge_counters(new.user_id);
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform internal.recompute_member_badge_counters(old.user_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_member_badge_counters_participants on public.community_messenger_participants;
drop trigger if exists trg_member_badge_counters_participants_ins on public.community_messenger_participants;
drop trigger if exists trg_member_badge_counters_participants_upd on public.community_messenger_participants;
drop trigger if exists trg_member_badge_counters_participants_del on public.community_messenger_participants;

create trigger trg_member_badge_counters_participants_ins
after insert on public.community_messenger_participants
for each row
when (coalesce(new.unread_count, 0) > 0 and new.left_at is null)
execute function internal.trg_member_badge_counters_participants();

create trigger trg_member_badge_counters_participants_upd
after update of unread_count, left_at, user_id, room_id on public.community_messenger_participants
for each row
when (
  ((coalesce(old.unread_count, 0) > 0 and old.left_at is null)
    is distinct from (coalesce(new.unread_count, 0) > 0 and new.left_at is null))
  or old.user_id is distinct from new.user_id
  or old.room_id is distinct from new.room_id
)
execute function internal.trg_member_badge_counters_participants();

create trigger trg_member_badge_counters_participants_del
after delete on public.community_messenger_participants
for each row
when (coalesce(old.unread_count, 0) > 0 and old.left_at is null)
execute function internal.trg_member_badge_counters_participants();

-- rooms: 방 삭제 또는 빈 메시지↔내용 있음 전환 때만 — 그 방의 안 읽은 활성 참가자들을 다시 센다
create or replace function internal.trg_member_badge_counters_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in
    select p.user_id
    from public.community_messenger_participants p
    where p.room_id = new.id and p.unread_count > 0 and p.left_at is null
  loop
    perform internal.recompute_member_badge_counters(v_user);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_member_badge_counters_rooms on public.community_messenger_rooms;
create trigger trg_member_badge_counters_rooms
after update of deleted_at, last_message
on public.community_messenger_rooms
for each row
when (
  (old.deleted_at is null) is distinct from (new.deleted_at is null)
  or internal.cm_badge_text_has_content(old.last_message)
     is distinct from internal.cm_badge_text_has_content(new.last_message)
)
execute function internal.trg_member_badge_counters_rooms();

-- 백필: 지금 안 읽은 활성 참여가 있는 사용자 전원
do $$
declare
  v_user uuid;
begin
  for v_user in
    select distinct p.user_id
    from public.community_messenger_participants p
    where p.unread_count > 0 and p.left_at is null
  loop
    perform internal.recompute_member_badge_counters(v_user);
  end loop;
end;
$$;

-- 읽기: 서버(service_role)만 — 1행
create or replace function public.get_member_badge_counters(p_user_id uuid)
returns table (
  b_general_direct integer,
  b_group integer,
  b_trade integer,
  b_customer_order integer,
  b_owner_order integer,
  version bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select m.b_general_direct, m.b_group, m.b_trade, m.b_customer_order, m.b_owner_order, m.version
  from public.member_badge_counters m
  where m.user_id = p_user_id;
$$;

revoke all on function public.get_member_badge_counters(uuid) from public, anon, authenticated;
grant execute on function public.get_member_badge_counters(uuid) to service_role;

commit;
