-- R7 잔여 (trade) — 거래 Admin 고정 조회 상한 제거 · 집계 RPC
--
-- 목적: 메모리 집계(거래글 최대 5000건 · posts/chat_rooms 최대 10000건)·후보 2000건 in(...) 을 DB 집계로 바꾼다.
--       읽기 전용 — 테이블·데이터 변경 없음 (인덱스 1개 추가만).
-- 대상 화면:
--   · /admin/trade/regions  (GET /api/admin/trade/regions)  → admin_trade_region_stats
--   · /admin/trade/members  (GET /api/admin/trade/members)  → admin_trade_members
--   · 거래글 「신고 접수」 탭·대시보드 거래 지표 (lib/admin/trade-admin/trade-posts-query.ts)
--     → 계산 열 admin_trade_post_has_open_report(posts) (PostgREST computed field — `posts?admin_trade_post_has_open_report=eq.true`)
-- 권한: SECURITY DEFINER · search_path=public · PUBLIC/anon/authenticated EXECUTE 회수 · service_role 만 EXECUTE
--       (앱 서버가 requireTradeAdmin 가드 통과 후 service role 로 호출). RPC 2개는 auth.role() = service_role 재확인.
-- 대기 신고 상태 'pending','reviewing' = lib/admin/metrics/admin-metric-filters.ts TRADE_REPORT_OPEN_STATUSES (계약 테스트로 고정).
--
-- 롤백:
--   drop function if exists public.admin_trade_members(text, text, uuid, integer, integer);
--   drop function if exists public.admin_trade_region_stats(timestamptz, timestamptz, integer, integer);
--   drop function if exists public.admin_trade_post_has_open_report(public.posts);
--   drop index if exists public.idx_reports_product_id;

-- ── 대기 신고가 걸린 거래글 (게시물 키 = product_id, 없으면 target_id — 예전 TS `product_id ?? target_id` 와 같다) ──
create or replace function public.admin_trade_post_has_open_report(p public.posts)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.reports r
     where r.status in ('pending', 'reviewing')
       and r.target_type in ('product', 'post')
       and (r.product_id = p.id or (r.product_id is null and r.target_id = p.id))
  );
$$;

revoke all on function public.admin_trade_post_has_open_report(public.posts) from public, anon, authenticated;
grant execute on function public.admin_trade_post_has_open_report(public.posts) to service_role;

create index if not exists idx_reports_product_id on public.reports (product_id) where product_id is not null;

-- ── 지역(시·군 LGU)별 거래글 현황 ─────────────────────────────────────────────
-- 지역 판정: trade_lgu_id(trim), 없으면 레거시 region/city → trade_local_area_lgu_map (읽기 시점 환산, 데이터 변경 없음).
-- p_from/p_to: 게시물 등록일 [p_from, p_to) (null = 제한 없음).
-- p_limit null = 전체 지역 행 (다른 호출자 — 거래글 화면 지역 선택 목록 호환), 값이 있으면 1~100 페이지.
-- 정렬: 거래글 많은 순 → lgu_id (지역 확인 불가 = 마지막) — 결정적.
-- 반환: { ok, total(지역 행 수), post_total(기간 내 거래글 수), rows[] }
create or replace function public.admin_trade_region_stats(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default null,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := case when p_limit is null then null else least(greatest(p_limit, 1), 100) end;
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_total bigint;
  v_posts bigint;
  v_rows jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  with promo as (
    select distinct o.target_id
      from public.point_promotion_orders o
     where o.domain = 'trade'
       and o.order_status = 'active'
       and o.start_at <= now()
       and o.end_at > now()
  ),
  src as (
    select p.id,
           p.user_id,
           coalesce(nullif(btrim(p.trade_lgu_id), ''), m.canonical_id) as lgu_id,
           (p.moderation_state = 'visible' and p.owner_state = 'none') as is_visible,
           p.seller_listing_state,
           public.admin_trade_post_has_open_report(p) as has_open_report,
           exists (select 1 from promo x where x.target_id = p.id::text) as has_promo
      from public.posts p
      left join public.trade_local_area_lgu_map m
        on nullif(btrim(p.trade_lgu_id), '') is null
       and m.region_id = p.region
       and m.city_id = p.city
     where (p_from is null or p.created_at >= p_from)
       and (p_to is null or p.created_at < p_to)
  ),
  agg as (
    select s.lgu_id,
           count(*) as posts,
           count(*) filter (where s.is_visible and s.seller_listing_state is distinct from 'reserved'
                                           and s.seller_listing_state is distinct from 'completed') as selling,
           count(*) filter (where s.is_visible and s.seller_listing_state = 'reserved') as reserved,
           count(*) filter (where s.is_visible and s.seller_listing_state = 'completed') as sold,
           count(*) filter (where not coalesce(s.is_visible, false)) as hidden,
           count(distinct s.user_id) as sellers,
           count(*) filter (where s.has_open_report) as open_reports,
           count(*) filter (where s.has_promo) as active_promotions
      from src s
     group by s.lgu_id
  ),
  named as (
    select a.*,
           case
             when a.lgu_id is null then '지역 확인 불가'
             when l.canonical_id is null then a.lgu_id
             when nullif(l.province_name, '') is not null then l.display_name || ' · ' || l.province_name
             else l.display_name
           end as name
      from agg a
      left join public.trade_national_lgu l on l.canonical_id = a.lgu_id
  ),
  page as (
    select n.*
      from named n
     order by n.posts desc, n.lgu_id asc nulls last
     limit v_limit offset v_offset
  )
  select (select count(*) from named),
         (select coalesce(sum(n.posts), 0) from named n),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'lgu_id', pg.lgu_id,
                    'name', pg.name,
                    'posts', pg.posts,
                    'selling', pg.selling,
                    'reserved', pg.reserved,
                    'sold', pg.sold,
                    'hidden', pg.hidden,
                    'sellers', pg.sellers,
                    'open_reports', pg.open_reports,
                    'active_promotions', pg.active_promotions
                  ) order by pg.posts desc, pg.lgu_id asc nulls last)
             from page pg
         ), '[]'::jsonb)
    into v_total, v_posts, v_rows;

  return jsonb_build_object('ok', true, 'total', v_total, 'post_total', v_posts, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_trade_region_stats(timestamptz, timestamptz, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_trade_region_stats(timestamptz, timestamptz, integer, integer) to service_role;

-- ── 거래 회원(판매자·구매자) ─────────────────────────────────────────────────
-- 거래 회원 = 거래글(posts.user_id)을 올렸거나 거래 채팅(chat_rooms item_trade buyer_id)에 참여한 회원 중 profiles 가 있는 회원.
-- p_user_id: 그 회원 1명만 (거래 활동이 없어도 profiles 가 있으면 돌려준다 — 상세 화면 머리말).
-- p_q: 닉네임 부분 일치 (대소문자 무시, 와일드카드 리터럴).
-- p_tab: all | restricted(진행 중 거래 활동 제한) | suspended(계정 suspended·blocked·banned).
-- 정렬: 판매글 수 + 구매 채팅 수 많은 순 → user_id — 결정적.
-- 반환: { ok, total(탭 건수), tab_counts{all,restricted,suspended}, rows[] } (rows: 페이지 1~100행)
create or replace function public.admin_trade_members(
  p_tab text default 'all',
  p_q text default null,
  p_user_id uuid default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tab text := coalesce(nullif(trim(p_tab), ''), 'all');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_q text := nullif(left(trim(coalesce(p_q, '')), 60), '');
  v_like text;
  v_total bigint;
  v_counts jsonb;
  v_rows jsonb;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if v_tab not in ('all', 'restricted', 'suspended') then
    return jsonb_build_object('ok', false, 'error', 'invalid_tab');
  end if;
  v_like := case when v_q is null then null
                 else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  with seller as (
    select p.user_id, count(*) as n
      from public.posts p
     where p.user_id is not null
       and (p_user_id is null or p.user_id = p_user_id)
     group by p.user_id
  ),
  buyer as (
    select c.buyer_id as user_id, count(*) as n
      from public.chat_rooms c
     where c.room_type = 'item_trade'
       and c.buyer_id is not null
       and (p_user_id is null or c.buyer_id = p_user_id)
     group by c.buyer_id
  ),
  activity as (
    select coalesce(s.user_id, b.user_id) as user_id,
           coalesce(s.n, 0) as post_count,
           coalesce(b.n, 0) as buyer_chat_count
      from seller s
      full join buyer b on b.user_id = s.user_id
  ),
  cand as (
    select a.user_id, a.post_count, a.buyer_chat_count
      from activity a
     where p_user_id is null
    union all
    select p_user_id,
           coalesce((select a.post_count from activity a where a.user_id = p_user_id), 0),
           coalesce((select a.buyer_chat_count from activity a where a.user_id = p_user_id), 0)
     where p_user_id is not null
  ),
  restr as (
    select s.user_id, array_agg(s.restriction order by s.created_at, s.id) as restrictions
      from public.sanctions s
     where s.scope = 'trade'
       and s.sanction_type = 'trade_restriction'
       and s.revoked_at is null
       and (s.end_at is null or s.end_at > now())
     group by s.user_id
  ),
  base as (
    select c.user_id,
           c.post_count,
           c.buyer_chat_count,
           pr.status as account_status,
           r.restrictions,
           coalesce(pr.status, '') in ('suspended', 'blocked', 'banned') as is_suspended
      from cand c
      join public.profiles pr on pr.id = c.user_id
      left join restr r on r.user_id = c.user_id
     where v_like is null or pr.nickname ilike v_like
  ),
  tabbed as (
    select b.*
      from base b
     where v_tab = 'all'
        or (v_tab = 'restricted' and b.restrictions is not null)
        or (v_tab = 'suspended' and b.is_suspended)
  ),
  page as (
    select t.*
      from tabbed t
     order by (t.post_count + t.buyer_chat_count) desc, t.user_id asc
     limit v_limit offset v_offset
  )
  select (select count(*) from tabbed),
         jsonb_build_object(
           'all', (select count(*) from base),
           'restricted', (select count(*) from base b where b.restrictions is not null),
           'suspended', (select count(*) from base b where b.is_suspended)
         ),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'user_id', pg.user_id,
                    'account_status', pg.account_status,
                    'post_count', pg.post_count,
                    'buyer_chat_count', pg.buyer_chat_count,
                    'trade_restrictions', coalesce(to_jsonb(pg.restrictions), '[]'::jsonb)
                  ) order by (pg.post_count + pg.buyer_chat_count) desc, pg.user_id asc)
             from page pg
         ), '[]'::jsonb)
    into v_total, v_counts, v_rows;

  return jsonb_build_object('ok', true, 'total', v_total, 'tab_counts', v_counts, 'rows', v_rows);
end;
$$;

revoke all on function public.admin_trade_members(text, text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_trade_members(text, text, uuid, integer, integer) to service_role;

notify pgrst, 'reload schema';
