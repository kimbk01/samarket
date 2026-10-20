-- 거래 Admin 설계 v2 M5 (D-50 · §F-5) — posts.trade_lgu_id 백필 (레거시 지역 코드만)
--
-- 범위
--   · trade_lgu_id IS NULL 이고 region/city 가 레거시 지역 코드(예: manila/m2)인 글만,
--     `trade_local_area_lgu_map` (PK region_id, city_id → 1:1) 로 canonical LGU 를 채운다.
--   · 자유 문자열 지역(예: "Metro Manila/Quezon City")은 채우지 않는다 → 마지막 SELECT 로 목록 보고(수동 확인).
--     이유: 현재 사용자 피드 지역 필터는 자유 문자열 글을 어느 LGU 에도 넣지 않는다. 별칭으로 채우면
--     그 글이 지역 피드에 새로 노출된다 = 노출 정책(K-1) 변경. 설계 §F-5「앱 노출 정책은 그대로」 우선.
--
-- 노출 불변 근거 (resolve-trade-feed-location-constraint.ts)
--   피드 지역 조건 = trade_lgu_id ∈ 대상 LGU 집합  OR  (trade_lgu_id IS NULL AND (region, city) ∈ 같은 집합의 local-area-map 멤버).
--   (region, city) → canonical 이 1:1 이므로, 백필 전후 같은 글이 같은 조건에서만 매칭된다.
--   앱 데이터(`data/trade-national-lgu/local-area-map.json`, PSGC-2025-2Q, 143행)와 DB 표가 같을 때만 성립 →
--   아래 사전 검사에서 다르면 중단한다.
--
-- 안전장치: 마이그레이션 트랜잭션 안에서 백필 전 상태를 기록하고, trade_lgu_id 외 값(status·판매 단계·노출 상태·updated_at)이
-- 하나라도 바뀌면 RAISE 로 전체 취소한다.
-- 롤백: update public.posts p set trade_lgu_id = null from public.trade_lgu_backfill_m5_log l where l.post_id = p.id;

do $$
declare
  v_rows int;
  v_versions int;
begin
  select count(*), count(distinct dataset_version) into v_rows, v_versions from public.trade_local_area_lgu_map;
  if v_rows <> 143 or v_versions <> 1
     or not exists (select 1 from public.trade_local_area_lgu_map where dataset_version = 'PSGC-2025-2Q') then
    raise exception 'M5 중단: trade_local_area_lgu_map 이 앱 데이터(PSGC-2025-2Q, 143행)와 다릅니다 (rows=%, versions=%)', v_rows, v_versions;
  end if;
end $$;

create table if not exists public.trade_lgu_backfill_m5_log (
  post_id uuid primary key,
  canonical_id text not null,
  before_status text,
  before_seller_listing_state text,
  before_moderation_state text,
  before_owner_state text,
  before_updated_at timestamptz,
  backfilled_at timestamptz not null default now()
);
comment on table public.trade_lgu_backfill_m5_log is
  '거래 Admin M5 trade_lgu_id 백필 기록 (롤백·검증용). 서비스 롤 전용.';
alter table public.trade_lgu_backfill_m5_log enable row level security;
revoke all on public.trade_lgu_backfill_m5_log from anon, authenticated;

insert into public.trade_lgu_backfill_m5_log (
  post_id, canonical_id, before_status, before_seller_listing_state, before_moderation_state, before_owner_state, before_updated_at
)
select p.id, m.canonical_id, p.status, p.seller_listing_state, p.moderation_state, p.owner_state, p.updated_at
from public.posts p
join public.trade_local_area_lgu_map m
  on m.region_id = p.region and m.city_id = p.city  -- 피드 조건과 같은 정확 일치
where p.trade_lgu_id is null
on conflict (post_id) do nothing;

update public.posts p
set trade_lgu_id = l.canonical_id
from public.trade_lgu_backfill_m5_log l
where l.post_id = p.id
  and p.trade_lgu_id is null;

do $$
declare
  v_changed int;
begin
  select count(*) into v_changed
  from public.posts p
  join public.trade_lgu_backfill_m5_log l on l.post_id = p.id
  where p.trade_lgu_id is distinct from l.canonical_id
     or p.status is distinct from l.before_status
     or p.seller_listing_state is distinct from l.before_seller_listing_state
     or p.moderation_state is distinct from l.before_moderation_state
     or p.owner_state is distinct from l.before_owner_state
     or p.updated_at is distinct from l.before_updated_at;
  if v_changed > 0 then
    raise exception 'M5 중단: trade_lgu_id 외 값이 바뀐 글 % 건 (트리거 영향) — 전체 취소', v_changed;
  end if;
end $$;


-- 보고용 (실행 후 확인): 백필 건수 · 남은 미매핑 글(자유 문자열 등) 목록 — 수동 확인 대상
-- select count(*) as backfilled from public.trade_lgu_backfill_m5_log;
-- select id, region, city, created_at from public.posts where trade_lgu_id is null order by created_at desc;
