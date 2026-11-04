-- 광고 수정 설계 2026-11-04 · D-10 (커뮤니티 글 삭제·숨김 ↔ 상위노출 주문 동기화)
-- 근거: docs/audit/ads-fix-design-2026-11-04.md §4 D-10 · PB-51
-- 운영 거래 정의(2026-11-04 확인) 와 같은 방식: trade_promotion_sync_listing(uuid, boolean) + posts_trade_promotion_sync() 트리거
--   (AFTER UPDATE OR DELETE · 진행 중 주문이 있을 때만 동기화 함수 호출). 커뮤니티는 AFTER UPDATE OF status, is_hidden, is_deleted 로 좁힘.
-- 커뮤니티 글 표 = public.community_posts (운영 확인): status ∈ active|hidden|deleted · is_hidden · is_deleted
--   (BEFORE 트리거 community_posts_sync_legacy_flags 가 status → is_hidden/is_deleted 를 맞춘다).
--
-- 규칙
--   · 글이 지워짐(status='deleted' · is_deleted · 행 DELETE) → 진행 중(active|paused) 주문 종료 · fault 'member' · 환급 0
--     (end_at 을 끝난 시각으로 당김 · 정지 중이었으면 정지 초 누계에 더함 — 거래 B-2 와 같음)
--   · 글이 숨겨짐(status='hidden' · is_hidden) → active 주문 정지 paused_by='system' (관리자 정지 주문은 그대로)
--   · 다시 보임(active) → paused_by='system' 주문만 재개 + 숨긴 시간만큼 end_at 연장
--   · 관리자 삭제·숨김은 관리자 API 가 먼저 admin_promotion_end(p_fault) 로 주문을 끝낸다 → 트리거는 끝난 주문을 건드리지 않음
--   · 심사 중(pending_review) 주문은 이 트리거가 바꾸지 않는다(설계 4종 범위 밖 — 보고에 기록)
--   · 감사: audit_logs community_promotion_order.end|pause|resume (actor system)
-- point_promotion_orders_paused_by_check 에 'system' 을 더한다 (운영 지금 값: admin|listing_owner_hidden|listing_admin_hidden).
--
-- 롤백 SQL
--   drop trigger if exists trg_community_posts_zz_promotion_sync on public.community_posts;
--   drop function if exists public.community_posts_promotion_sync();
--   drop function if exists public.community_promotion_sync_post(uuid, boolean);
--   update public.point_promotion_orders set paused_by = null where paused_by = 'system';  -- (정지 행이 남아 있으면 먼저 재개/정리)
--   alter table public.point_promotion_orders drop constraint if exists point_promotion_orders_paused_by_check;
--   alter table public.point_promotion_orders add constraint point_promotion_orders_paused_by_check
--     check (paused_by is null or paused_by in ('admin', 'listing_owner_hidden', 'listing_admin_hidden'));

alter table public.point_promotion_orders drop constraint if exists point_promotion_orders_paused_by_check;
alter table public.point_promotion_orders add constraint point_promotion_orders_paused_by_check
  check (paused_by is null or paused_by in ('admin', 'listing_owner_hidden', 'listing_admin_hidden', 'system'));

create or replace function public.community_promotion_sync_post(p_post_id uuid, p_post_gone boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
  v_terminal text;
  v_hidden boolean := false;
  v_row record;
  v_gap integer;
  v_end timestamptz;
  v_n integer := 0;
begin
  if p_post_gone then
    v_terminal := 'post_owner_deleted';
  else
    select status, is_hidden, is_deleted into v_post from public.community_posts where id = p_post_id;
    if not found then
      v_terminal := 'post_owner_deleted';
    elsif lower(coalesce(v_post.status, '')) = 'deleted' or coalesce(v_post.is_deleted, false) then
      v_terminal := 'post_owner_deleted';
    elsif lower(coalesce(v_post.status, '')) = 'hidden' or coalesce(v_post.is_hidden, false) then
      v_hidden := true;
    end if;
  end if;

  for v_row in
    select * from public.point_promotion_orders
     where domain = 'community' and target_type = 'community_post' and target_id = p_post_id::text
       and order_status in ('active', 'paused')
     for update
  loop
    if v_terminal is not null then
      v_gap := case when v_row.order_status = 'paused' and v_row.paused_at is not null
                    then greatest(0, floor(extract(epoch from (now() - v_row.paused_at))))::integer else 0 end;
      update public.point_promotion_orders
         set order_status = 'ended', ended_at = now(), ended_by = null,
             end_at = greatest(start_at, least(end_at, now())),
             end_reason_code = v_terminal, fault = 'member', refund_points = 0,
             paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
             paused_at = null, paused_by = null
       where id = v_row.id;
      insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
      values ('system', null, 'community_promotion_order', v_row.id::text, 'community_promotion_order.end',
              jsonb_build_object('order_status', v_row.order_status, 'paused_by', v_row.paused_by, 'end_at', v_row.end_at),
              jsonb_build_object('order_status', 'ended', 'end_reason_code', v_terminal, 'fault', 'member', 'refund_points', 0));
      v_n := v_n + 1;
    elsif v_hidden then
      if v_row.order_status = 'active' then
        update public.point_promotion_orders
           set order_status = 'paused', paused_at = now(), paused_by = 'system'
         where id = v_row.id;
        insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
        values ('system', null, 'community_promotion_order', v_row.id::text, 'community_promotion_order.pause',
                jsonb_build_object('order_status', 'active', 'end_at', v_row.end_at),
                jsonb_build_object('order_status', 'paused', 'paused_by', 'system', 'reason', 'post_hidden'));
        v_n := v_n + 1;
      end if;
    elsif v_row.order_status = 'paused' and v_row.paused_by = 'system' then
      v_gap := greatest(0, floor(extract(epoch from (now() - coalesce(v_row.paused_at, now())))))::integer;
      update public.point_promotion_orders
         set order_status = 'active', paused_at = null, paused_by = null,
             paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
             end_at = end_at + make_interval(secs => v_gap)
       where id = v_row.id
      returning end_at into v_end;
      insert into public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
      values ('system', null, 'community_promotion_order', v_row.id::text, 'community_promotion_order.resume',
              jsonb_build_object('order_status', 'paused', 'paused_by', 'system', 'end_at', v_row.end_at),
              jsonb_build_object('order_status', 'active', 'end_at', v_end, 'extended_seconds', v_gap, 'reason', 'post_visible'));
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

create or replace function public.community_posts_promotion_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.point_promotion_orders
                where domain = 'community' and target_type = 'community_post' and target_id = old.id::text
                  and order_status in ('active', 'paused')) then
      perform public.community_promotion_sync_post(old.id, true);
    end if;
    return null;
  end if;
  if new.status is distinct from old.status
     or new.is_hidden is distinct from old.is_hidden
     or new.is_deleted is distinct from old.is_deleted then
    if exists (select 1 from public.point_promotion_orders
                where domain = 'community' and target_type = 'community_post' and target_id = new.id::text
                  and order_status in ('active', 'paused')) then
      perform public.community_promotion_sync_post(new.id, false);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_community_posts_zz_promotion_sync on public.community_posts;
-- UPDATE OF 로 좁힌다: 조회수·좋아요 갱신(view_count 등)에는 트리거가 돌지 않는다.
create trigger trg_community_posts_zz_promotion_sync
  after update of status, is_hidden, is_deleted or delete on public.community_posts
  for each row execute function public.community_posts_promotion_sync();

revoke all on function public.community_promotion_sync_post(uuid, boolean) from public, anon, authenticated;
revoke all on function public.community_posts_promotion_sync() from public, anon, authenticated;
grant execute on function public.community_promotion_sync_post(uuid, boolean) to service_role;
grant execute on function public.community_posts_promotion_sync() to service_role;
