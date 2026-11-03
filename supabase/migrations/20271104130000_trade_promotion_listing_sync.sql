-- 거래 상위노출 ↔ 글 상태 연동 (설계 docs/audit/trade-promotion-listing-lifecycle-design-2026-11-03.md · Owner 「설계안 승인」 2026-11-03)
-- 원칙: 광고 기간은 글이 노출될 수 있을 때만 흐른다.
--   판매완료·판매자 삭제·관리자 삭제(완전 삭제 포함) → 종료 (회원 귀책 · 환급 0 — admin_trade_promotion_end 귀책 규칙과 같음)
--   판매자 숨김·관리자 숨김                        → 일시정지 (paused_by = listing_*)
--   다시 노출 가능                                 → listing 일시정지만 재개 + 멈춘 시간만큼 종료일 연장 (admin_trade_promotion_resume 계산과 같음)
--   예약중은 상위노출 대상(공개 상태 「판매중」)이라 처리하지 않는다.
-- 관리자가 직접 멈춘 주문(paused_by='admin')은 글 상태로 재개하지 않는다.

alter table public.point_promotion_orders
  add column if not exists paused_by text;

alter table public.point_promotion_orders
  drop constraint if exists point_promotion_orders_paused_by_check;
alter table public.point_promotion_orders
  add constraint point_promotion_orders_paused_by_check
  check (paused_by is null or paused_by in ('admin', 'listing_owner_hidden', 'listing_admin_hidden'));

-- ── 글 1개의 거래 주문을 글 상태에 맞춘다 ──
create or replace function public.trade_promotion_sync_listing(p_post_id uuid, p_post_gone boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post record;
  v_row record;
  v_terminal text;
  v_pause text;
  v_gap integer;
  v_end timestamptz;
  v_n integer := 0;
begin
  if p_post_gone then
    v_terminal := 'listing_admin_deleted';
  else
    select status, seller_listing_state, owner_state, moderation_state, is_deleted
      into v_post from public.posts where id = p_post_id;
    if not found then
      v_terminal := 'listing_admin_deleted';
    else
      v_terminal := case
        when v_post.moderation_state = 'admin_deleted' then 'listing_admin_deleted'
        when v_post.owner_state = 'owner_deleted' or coalesce(v_post.is_deleted, false) then 'listing_owner_deleted'
        when v_post.seller_listing_state = 'completed' or v_post.status = 'sold' then 'listing_sold'
        else null
      end;
      v_pause := case
        when v_terminal is not null then null
        when v_post.moderation_state = 'admin_hidden' then 'listing_admin_hidden'
        when v_post.owner_state = 'owner_hidden' then 'listing_owner_hidden'
        else null
      end;
    end if;
  end if;

  for v_row in
    select * from public.point_promotion_orders
     where target_type = 'product' and target_id = p_post_id::text
       and domain = 'trade' and order_status in ('active', 'paused')
     for update
  loop
    if v_terminal is not null then
      v_gap := case when v_row.order_status = 'paused' and v_row.paused_at is not null
                    then greatest(0, floor(extract(epoch from (now() - v_row.paused_at))))::integer else 0 end;
      update public.point_promotion_orders
         set order_status = 'ended', ended_at = now(), ended_by = null,
             end_reason_code = v_terminal, fault = 'member', refund_points = 0,
             paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
             paused_at = null, paused_by = null
       where id = v_row.id;
      perform public.trade_promotion_audit('system', null, v_row.id, 'end',
        jsonb_build_object('order_status', v_row.order_status, 'paused_by', v_row.paused_by, 'end_at', v_row.end_at),
        jsonb_build_object('order_status', 'ended', 'end_reason_code', v_terminal, 'fault', 'member', 'refund_points', 0),
        null, null);
      v_n := v_n + 1;
    elsif v_pause is not null then
      if v_row.order_status = 'active' then
        update public.point_promotion_orders
           set order_status = 'paused', paused_at = now(), paused_by = v_pause
         where id = v_row.id;
        perform public.trade_promotion_audit('system', null, v_row.id, 'pause',
          jsonb_build_object('order_status', 'active'),
          jsonb_build_object('order_status', 'paused', 'paused_by', v_pause), null, null);
        v_n := v_n + 1;
      elsif v_row.paused_by like 'listing_%' and v_row.paused_by is distinct from v_pause then
        update public.point_promotion_orders set paused_by = v_pause where id = v_row.id;
        v_n := v_n + 1;
      end if;
    elsif v_row.order_status = 'paused' and v_row.paused_by like 'listing_%' then
      v_gap := greatest(0, floor(extract(epoch from (now() - coalesce(v_row.paused_at, now()))))::integer);
      update public.point_promotion_orders
         set order_status = 'active', paused_at = null, paused_by = null,
             paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
             end_at = end_at + make_interval(secs => v_gap)
       where id = v_row.id
      returning end_at into v_end;
      perform public.trade_promotion_audit('system', null, v_row.id, 'resume',
        jsonb_build_object('order_status', 'paused', 'paused_by', v_row.paused_by, 'end_at', v_row.end_at),
        jsonb_build_object('order_status', 'active', 'end_at', v_end, 'extended_seconds', v_gap), null, null);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.trade_promotion_sync_listing(uuid, boolean) from public, anon, authenticated;
grant execute on function public.trade_promotion_sync_listing(uuid, boolean) to service_role;

-- ── posts 트리거: 노출에 닿는 칸이 바뀔 때·완전 삭제될 때만 ──
create or replace function public.posts_trade_promotion_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.point_promotion_orders
                where target_type = 'product' and target_id = old.id::text
                  and domain = 'trade' and order_status in ('active', 'paused')) then
      perform public.trade_promotion_sync_listing(old.id, true);
    end if;
    return null;
  end if;
  if new.status is distinct from old.status
     or new.seller_listing_state is distinct from old.seller_listing_state
     or new.owner_state is distinct from old.owner_state
     or new.moderation_state is distinct from old.moderation_state
     or new.is_deleted is distinct from old.is_deleted then
    if exists (select 1 from public.point_promotion_orders
                where target_type = 'product' and target_id = new.id::text
                  and domain = 'trade' and order_status in ('active', 'paused')) then
      perform public.trade_promotion_sync_listing(new.id, false);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.posts_trade_promotion_sync() from public, anon, authenticated;

drop trigger if exists trg_posts_zz_trade_promotion_sync on public.posts;
create trigger trg_posts_zz_trade_promotion_sync
  after update or delete on public.posts
  for each row execute function public.posts_trade_promotion_sync();

-- ── 관리자 일시정지 = paused_by 'admin' · 관리자 재개는 관리자 일시정지만 ──
create or replace function public.admin_trade_promotion_pause(
  p_order_id uuid, p_actor_id uuid, p_reason text, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;
  update public.point_promotion_orders set order_status = 'paused', paused_at = now(), paused_by = 'admin' where id = p_order_id;
  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'pause',
    jsonb_build_object('order_status', 'active'), jsonb_build_object('order_status', 'paused', 'reason', left(trim(p_reason), 500)),
    p_ip, p_user_agent);
  return jsonb_build_object('ok', true, 'order_status', 'paused', 'end_at', v_row.end_at);
end;
$$;

create or replace function public.admin_trade_promotion_resume(
  p_order_id uuid, p_actor_id uuid, p_reason text, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_gap integer;
  v_end timestamptz;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status <> 'paused' then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;
  -- 글 상태(숨김) 때문에 멈춘 주문은 글이 다시 노출될 때 저절로 재개된다
  if v_row.paused_by like 'listing_%' then
    return jsonb_build_object('ok', false, 'error', 'listing_paused', 'paused_by', v_row.paused_by);
  end if;
  v_gap := greatest(0, floor(extract(epoch from (now() - coalesce(v_row.paused_at, now()))))::integer);
  update public.point_promotion_orders
     set order_status = 'active', paused_at = null, paused_by = null,
         paused_seconds_total = coalesce(paused_seconds_total, 0) + v_gap,
         end_at = end_at + make_interval(secs => v_gap)
   where id = p_order_id
  returning end_at into v_end;
  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'resume',
    jsonb_build_object('order_status', 'paused', 'end_at', v_row.end_at),
    jsonb_build_object('order_status', 'active', 'end_at', v_end, 'extended_seconds', v_gap, 'reason', left(trim(p_reason), 500)),
    p_ip, p_user_agent);
  return jsonb_build_object('ok', true, 'order_status', 'active', 'end_at', v_end, 'extended_seconds', v_gap);
end;
$$;

-- 기존 관리자 일시정지 행 표시 (운영 0건이어도 안전)
update public.point_promotion_orders
   set paused_by = 'admin'
 where domain = 'trade' and order_status = 'paused' and paused_by is null;

-- ── 1회 정리: 지금 진행·일시정지 중인 거래 주문을 글 상태에 맞춘다 ──
do $$
declare
  v_post text;
begin
  for v_post in
    select distinct target_id from public.point_promotion_orders
     where domain = 'trade' and target_type = 'product' and order_status in ('active', 'paused')
  loop
    if v_post ~ '^[0-9a-fA-F-]{36}$' then
      perform public.trade_promotion_sync_listing(v_post::uuid, false);
    end if;
  end loop;
end;
$$;
