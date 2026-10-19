-- 거래 Admin M2 (D-02·D-03·D-04①·D-10·D-13, 설계 v2 §F-1-1): 판매 단계 · 관리자 노출 · 판매자 노출 분리.
--
-- - 판매 단계 원본 = seller_listing_state (+ reserved_buyer_id / sold_buyer_id). 숨김·삭제·복원은 건드리지 않는다.
-- - moderation_state = 관리자 노출 (visible · admin_hidden · admin_deleted · legacy_hidden)
-- - owner_state      = 판매자 노출 (none · owner_hidden · owner_deleted)
-- - posts.status 는 기존 독자(앱 피드·채팅 시작·유사 글 등) 호환용 노출 게이트로 남긴다.
--   두 노출 값 중 하나라도 숨김이면 'hidden', 아니면 판매 단계 미러 — 트리거가 계산한다.
-- - status CHECK (active, reserved, sold, hidden) 는 그대로. 'deleted' 를 추가하지 않는다.
--
-- 기존 데이터 (Owner O-8): 현재 status='hidden' 인 글은 원인 기록이 없으므로 'legacy_hidden'(원인 미확인)으로
-- 표시만 한다. status·판매 단계·구매자 값은 한 건도 바꾸지 않는다 — 전후 건수가 다르면 전체 롤백.

alter table public.posts
  add column if not exists moderation_state text not null default 'visible',
  add column if not exists owner_state text not null default 'none',
  add column if not exists moderation_reason text,
  add column if not exists moderation_by uuid,
  add column if not exists moderation_at timestamptz,
  add column if not exists owner_state_at timestamptz;

alter table public.posts drop constraint if exists posts_moderation_state_check;
alter table public.posts add constraint posts_moderation_state_check
  check (moderation_state in ('visible', 'admin_hidden', 'admin_deleted', 'legacy_hidden'));

alter table public.posts drop constraint if exists posts_owner_state_check;
alter table public.posts add constraint posts_owner_state_check
  check (owner_state in ('none', 'owner_hidden', 'owner_deleted'));

create index if not exists idx_posts_moderation_state on public.posts (moderation_state) where moderation_state <> 'visible';
create index if not exists idx_posts_owner_state on public.posts (owner_state) where owner_state <> 'none';

-- ── 기존 데이터 이관 (판매 상태 무변경 검증) ──
do $$
declare
  v_before jsonb;
  v_after jsonb;
begin
  select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) into v_before from (
    select status, seller_listing_state, reserved_buyer_id is null as rb_null, sold_buyer_id is null as sb_null, count(*) as n
      from public.posts group by 1, 2, 3, 4
  ) x;

  update public.posts
     set moderation_state = 'legacy_hidden'
   where status = 'hidden'
     and moderation_state = 'visible'
     and owner_state = 'none';

  select coalesce(jsonb_agg(x order by x::text), '[]'::jsonb) into v_after from (
    select status, seller_listing_state, reserved_buyer_id is null as rb_null, sold_buyer_id is null as sb_null, count(*) as n
      from public.posts group by 1, 2, 3, 4
  ) x;

  if v_before is distinct from v_after then
    raise exception 'trade_admin_m2: sale/status snapshot changed (before %, after %)', v_before, v_after;
  end if;

  if exists (select 1 from public.posts where status = 'hidden' and moderation_state = 'visible' and owner_state = 'none') then
    raise exception 'trade_admin_m2: hidden row without visibility reason remains';
  end if;
  if exists (select 1 from public.posts where status <> 'hidden' and (moderation_state <> 'visible' or owner_state <> 'none')) then
    raise exception 'trade_admin_m2: visible row marked hidden';
  end if;
end $$;

-- ── 노출 게이트 트리거 ──
create or replace function public.posts_visibility_gate()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_visible boolean;
  v_was_visible boolean;
begin
  -- 원인 미확인 숨김은 이관에서만 생긴다. 새로 지정할 수 없다.
  if new.moderation_state = 'legacy_hidden'
     and (tg_op = 'INSERT' or old.moderation_state is distinct from 'legacy_hidden') then
    raise exception 'posts_legacy_hidden_readonly' using errcode = 'P0001';
  end if;

  v_visible := new.moderation_state = 'visible' and new.owner_state = 'none';

  -- 노출 원인 없이 status='hidden' 을 직접 쓰는 옛 경로는 거부한다 (조용히 섞이지 않게).
  if v_visible and new.status = 'hidden'
     and (tg_op = 'INSERT' or old.status is distinct from 'hidden') then
    raise exception 'posts_status_hidden_requires_visibility_state' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' then
    v_was_visible := old.moderation_state = 'visible' and old.owner_state = 'none';

    -- 판매 값을 status 로만 바꾼 경로: 판매 단계도 같이 맞춘다 (숨김 중이어도 판매 단계는 저장).
    if new.status is distinct from old.status
       and new.status in ('active', 'reserved', 'sold')
       and new.seller_listing_state is not distinct from old.seller_listing_state then
      new.seller_listing_state := case new.status
        when 'sold' then 'completed'
        when 'reserved' then 'reserved'
        else case when old.seller_listing_state in ('reserved', 'completed') then 'inquiry'
                  else old.seller_listing_state end
      end;
    end if;

    if not v_visible then
      new.status := 'hidden';
    elsif not v_was_visible then
      -- 숨김 → 노출: 보존된 판매 단계에서 다시 계산 (판매완료는 판매완료, 예약은 예약)
      new.status := case new.seller_listing_state
        when 'completed' then 'sold'
        when 'reserved' then 'reserved'
        else 'active'
      end;
    end if;

    if new.moderation_state is distinct from old.moderation_state then
      new.moderation_at := now();
    end if;
    if new.owner_state is distinct from old.owner_state then
      new.owner_state_at := now();
    end if;
  else
    if not v_visible then
      new.status := 'hidden';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_posts_visibility_gate on public.posts;
create trigger trg_posts_visibility_gate
  before insert or update on public.posts
  for each row execute function public.posts_visibility_gate();

comment on column public.posts.moderation_state is
  '관리자 노출: visible | admin_hidden | admin_deleted | legacy_hidden(2027-05 이관 시 원인 미확인 숨김, 신규 지정 불가)';
comment on column public.posts.owner_state is '판매자 노출: none | owner_hidden | owner_deleted';
comment on column public.posts.status is
  '호환 노출 게이트 — trg_posts_visibility_gate 가 계산 (숨김이면 hidden, 아니면 판매 단계 미러). 숨김을 직접 쓰지 말 것.';
