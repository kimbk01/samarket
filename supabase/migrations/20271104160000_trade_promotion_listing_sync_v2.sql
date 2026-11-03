-- 거래 상위노출 ↔ 글 상태 연동 v2 + 거래 글 노출 방송 토픽
-- 설계: docs/audit/trade-reaudit-fix-design-2026-11-04.md B-2·B-3·B-7 ·
--       docs/audit/trade-visibility-admin-full-design-2026-11-04.md §1-3 (Owner 「설계안 승인」 2026-11-04)
--
-- B-2: 글 상태로 끝난 주문도 종료일을 끝난 시각으로 당긴다(관리자 종료와 같은 규칙) + 기존 행 1회 정정.
-- B-3: 글 상태 판정을 함수 1개(trade_promotion_listing_verdict)로 빼고, 관리자 재개도 같은 판정을 쓴다.
--      숨김 글 = 재개하지 않고 글 숨김 대기(paused_by = listing_*) · 판매완료·삭제 = 트리거와 같은 종료.
-- B-7: 심사 중(pending_review) 주문도 연동 — 판매완료·삭제면 반려와 같은 보류 해제 + 취소.
--      숨김은 심사 중에는 처리하지 않는다(승인 때 판정). 관리자 승인은 승인 직전에 같은 판정을 본다.
-- §1-3: Realtime 비공개 방송 토픽 `trade-listing-visibility` — 로그인 회원만 구독(서버만 발행).

-- ── 글 상태 판정 1곳 ──
create or replace function public.trade_promotion_listing_verdict(p_post_id uuid, p_post_gone boolean default false)
returns table (terminal text, pause text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_post record;
begin
  if p_post_gone then
    terminal := 'listing_admin_deleted'; pause := null; return next; return;
  end if;
  select status, seller_listing_state, owner_state, moderation_state, is_deleted
    into v_post from public.posts where id = p_post_id;
  if not found then
    terminal := 'listing_admin_deleted'; pause := null; return next; return;
  end if;
  terminal := case
    when v_post.moderation_state = 'admin_deleted' then 'listing_admin_deleted'
    when v_post.owner_state = 'owner_deleted' or coalesce(v_post.is_deleted, false) then 'listing_owner_deleted'
    when v_post.seller_listing_state = 'completed' or v_post.status = 'sold' then 'listing_sold'
    else null
  end;
  pause := case
    when terminal is not null then null
    when v_post.moderation_state = 'admin_hidden' then 'listing_admin_hidden'
    when v_post.owner_state = 'owner_hidden' then 'listing_owner_hidden'
    else null
  end;
  return next;
end;
$$;

revoke all on function public.trade_promotion_listing_verdict(uuid, boolean) from public, anon, authenticated;
grant execute on function public.trade_promotion_listing_verdict(uuid, boolean) to service_role;

-- ── 보류 포인트 해제 1곳 (관리자 반려 · 심사 중 글 판매완료·삭제) ──
create or replace function public.trade_promotion_release_hold(
  p_order_id uuid, p_actor_type text, p_actor_id uuid, p_description text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold record;
begin
  select * into v_hold from public.promotion_point_holds where promotion_order_id = p_order_id for update;
  if not found or v_hold.status <> 'held' or v_hold.amount <= 0 then
    return 0;
  end if;
  perform 1 from public.profiles where id = v_hold.user_id for update;
  update public.promotion_point_holds set status = 'released', updated_at = now() where id = v_hold.id;
  insert into public.point_ledger
    (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
  values
    (v_hold.user_id, 'ad_hold_release', v_hold.amount, public.sum_user_point_ledger(v_hold.user_id) + v_hold.amount,
     'promotion_order', 'release:' || v_hold.id::text, p_description, p_actor_type, p_actor_id);
  perform public.project_user_point_balance_from_ledger(v_hold.user_id);
  return v_hold.amount;
end;
$$;

revoke all on function public.trade_promotion_release_hold(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.trade_promotion_release_hold(uuid, text, uuid, text) to service_role;

-- ── 글 1개의 거래 주문을 글 상태에 맞춘다 (v2) ──
create or replace function public.trade_promotion_sync_listing(p_post_id uuid, p_post_gone boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terminal text;
  v_pause text;
  v_row record;
  v_gap integer;
  v_end timestamptz;
  v_released integer;
  v_n integer := 0;
begin
  select v.terminal, v.pause into v_terminal, v_pause
    from public.trade_promotion_listing_verdict(p_post_id, p_post_gone) v;

  for v_row in
    select * from public.point_promotion_orders
     where target_type = 'product' and target_id = p_post_id::text
       and domain = 'trade' and order_status in ('active', 'paused', 'pending_review')
     for update
  loop
    if v_row.order_status = 'pending_review' then
      -- B-7: 심사 중 — 판매완료·삭제면 반려와 같은 보류 해제 + 취소(포인트 차감 없음). 숨김은 승인 때 판정.
      if v_terminal is not null then
        v_released := public.trade_promotion_release_hold(
          v_row.id, 'system', null, '거래 상위노출 신청 취소(글 판매완료·삭제) — 보류 해제');
        update public.point_promotion_orders
           set order_status = 'cancelled', ended_at = now(), ended_by = null,
               end_at = greatest(start_at, least(end_at, now())),
               end_reason_code = v_terminal, fault = 'member', refund_points = 0
         where id = v_row.id;
        perform public.trade_promotion_audit('system', null, v_row.id, 'cancel',
          jsonb_build_object('order_status', 'pending_review'),
          jsonb_build_object('order_status', 'cancelled', 'end_reason_code', v_terminal, 'released_points', v_released),
          null, null);
        v_n := v_n + 1;
      end if;
    elsif v_terminal is not null then
      v_gap := case when v_row.order_status = 'paused' and v_row.paused_at is not null
                    then greatest(0, floor(extract(epoch from (now() - v_row.paused_at))))::integer else 0 end;
      -- B-2: 종료일을 끝난 시각으로 당긴다(관리자 종료와 같음 · 시작 전 주문은 시작일)
      update public.point_promotion_orders
         set order_status = 'ended', ended_at = now(), ended_by = null,
             end_at = greatest(start_at, least(end_at, now())),
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

-- ── posts 트리거: 심사 중 주문도 대상 (B-7) ──
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
                  and domain = 'trade' and order_status in ('active', 'paused', 'pending_review')) then
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
                  and domain = 'trade' and order_status in ('active', 'paused', 'pending_review')) then
      perform public.trade_promotion_sync_listing(new.id, false);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.posts_trade_promotion_sync() from public, anon, authenticated;

-- ── 관리자 재개: 재개 직전에 글 상태 확인 (B-3) ──
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
  v_terminal text;
  v_pause text;
  v_post_id uuid;
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

  if v_row.target_type = 'product' and v_row.target_id ~ '^[0-9a-fA-F-]{36}$' then
    v_post_id := v_row.target_id::uuid;
    select v.terminal, v.pause into v_terminal, v_pause from public.trade_promotion_listing_verdict(v_post_id, false) v;
    if v_terminal is not null then
      -- 판매완료·삭제: 트리거와 같은 종료(회원 귀책 · 환급 0)
      perform public.trade_promotion_sync_listing(v_post_id, false);
      perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'resume_blocked',
        jsonb_build_object('order_status', 'paused', 'paused_by', v_row.paused_by),
        jsonb_build_object('order_status', 'ended', 'end_reason_code', v_terminal, 'reason', left(trim(p_reason), 500)),
        p_ip, p_user_agent);
      return jsonb_build_object('ok', true, 'order_status', 'ended', 'end_reason_code', v_terminal);
    end if;
    if v_pause is not null then
      -- 숨김: 재개하지 않고 글 숨김 대기로 바꾼다(멈춘 시간은 계속 쌓이고, 글이 보이면 트리거가 재개 + 연장)
      update public.point_promotion_orders set paused_by = v_pause where id = p_order_id;
      perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'resume_waiting_listing',
        jsonb_build_object('order_status', 'paused', 'paused_by', v_row.paused_by),
        jsonb_build_object('order_status', 'paused', 'paused_by', v_pause, 'reason', left(trim(p_reason), 500)),
        p_ip, p_user_agent);
      return jsonb_build_object('ok', true, 'order_status', 'paused', 'waiting', 'listing', 'paused_by', v_pause);
    end if;
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

-- ── 관리자 승인: 승인 직전에 글 상태 확인 (B-7) ──
create or replace function public.admin_trade_promotion_approve(
  p_order_id uuid, p_actor_id uuid, p_reason text default null, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_hold record;
  v_end timestamptz;
  v_terminal text;
  v_pause text;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;

  if v_row.target_type = 'product' and v_row.target_id ~ '^[0-9a-fA-F-]{36}$' then
    select v.terminal, v.pause into v_terminal, v_pause
      from public.trade_promotion_listing_verdict(v_row.target_id::uuid, false) v;
    if v_terminal is not null then
      -- 판매완료·삭제된 글은 승인하지 않는다(포인트 차감 없음)
      return jsonb_build_object('ok', false, 'error', 'listing_unavailable', 'end_reason_code', v_terminal);
    end if;
  end if;

  select * into v_hold from public.promotion_point_holds where promotion_order_id = p_order_id for update;
  if coalesce(v_row.point_cost, 0) > 0 then
    if not found or v_hold.status <> 'held' then
      return jsonb_build_object('ok', false, 'error', 'hold_missing');
    end if;
    update public.promotion_point_holds set status = 'captured', updated_at = now() where id = v_hold.id;
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
    values
      (v_row.user_id, 'ad_purchase', 0, public.sum_user_point_ledger(v_row.user_id), 'promotion_order',
       'capture:' || p_order_id::text, '거래 상위노출 승인 — ' || v_hold.amount || 'P 확정', 'admin', p_actor_id);
  end if;

  v_end := now() + make_interval(days => greatest(1, coalesce(v_row.duration_days, 7)));
  -- 숨김 글: 승인 후 바로 글 숨김 일시정지 — 기간은 글이 보일 때부터 흐른다(재개 때 멈춘 시간만큼 연장)
  update public.point_promotion_orders
     set order_status = case when v_pause is not null then 'paused' else 'active' end,
         paused_at = case when v_pause is not null then now() else null end,
         paused_by = v_pause,
         start_at = now(), end_at = v_end, review_reason = nullif(left(trim(coalesce(p_reason, '')), 500), '')
   where id = p_order_id;

  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'approve',
    jsonb_build_object('order_status', v_row.order_status),
    jsonb_build_object('order_status', case when v_pause is not null then 'paused' else 'active' end,
                       'paused_by', v_pause, 'end_at', v_end, 'captured_points', coalesce(v_hold.amount, 0),
                       'reason', nullif(trim(coalesce(p_reason, '')), '')),
    p_ip, p_user_agent);

  return jsonb_build_object('ok', true,
    'order_status', case when v_pause is not null then 'paused' else 'active' end,
    'end_at', v_end,
    'waiting', case when v_pause is not null then 'listing' else null end);
end;
$$;

-- ── 관리자 반려: 보류 해제를 공용 함수로 (동작 동일) ──
create or replace function public.admin_trade_promotion_reject(
  p_order_id uuid, p_actor_id uuid, p_reason text, p_ip text default null, p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_released integer := 0;
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
  if v_row.order_status <> 'pending_review' then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;

  v_released := public.trade_promotion_release_hold(p_order_id, 'admin', p_actor_id, '거래 상위노출 반려 — 보류 해제');

  update public.point_promotion_orders
     set order_status = 'rejected', review_reason = left(trim(p_reason), 500),
         ended_by = p_actor_id, ended_at = now(), end_reason_code = 'admin_reject'
   where id = p_order_id;

  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'reject',
    jsonb_build_object('order_status', v_row.order_status),
    jsonb_build_object('order_status', 'rejected', 'released_points', v_released, 'reason', left(trim(p_reason), 500)),
    p_ip, p_user_agent);

  return jsonb_build_object('ok', true, 'order_status', 'rejected', 'released_points', v_released);
end;
$$;

-- ── B-2 1회 정정: 글 상태로 끝난 주문의 종료일 = 끝난 시각 ──
update public.point_promotion_orders
   set end_at = greatest(start_at, least(end_at, ended_at))
 where domain = 'trade' and end_reason_code like 'listing_%' and ended_at is not null and end_at > ended_at;

-- ── §1-3 Realtime 토픽: 거래 글 노출 방송(로그인 회원 구독 · 서버만 발행) ──
do $$
declare
  v_def text;
  v_new text;
  v_anchor constant text := E'      else false\n    end,';
begin
  v_def := pg_get_functiondef('internal.cm_realtime_can_read_topic(text)'::regprocedure);
  if position('''trade-listing-visibility''' in v_def) > 0 then
    return; -- 이미 있음
  end if;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'cm_realtime_can_read_topic: anchor not found exactly once — stop';
  end if;
  v_new := replace(v_def, v_anchor,
    E'      -- 거래 글 노출 방송 (설계 2026-11-04 §1-3): 로그인 회원 누구나 구독, 발행은 서버(service role)만\n'
    || E'      when p_topic = ''trade-listing-visibility'' then\n'
    || E'        auth.uid() is not null\n'
    || v_anchor);
  execute v_new;
end;
$$;
