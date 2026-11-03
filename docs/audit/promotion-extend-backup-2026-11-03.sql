-- 재감사 R2 적용 직전 운영 함수 정의 원문 (2026-11-03 PHT, 프로젝트 ckdosyydvgzqwpbwuhon)
-- 되돌리기: 이 파일을 그대로 실행하면 R2 이전 정의로 돌아간다. 각 블록 위 md5 = pg_get_functiondef md5.

-- admin_promotion_end md5=0ba28eca25cfbfcbb4fb4117148f358f
CREATE OR REPLACE FUNCTION public.admin_promotion_end(p_order_id uuid, p_actor_id uuid, p_reason_code text, p_fault text, p_reason text, p_preview boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_paid integer;
  v_total numeric;
  v_paused numeric;
  v_used numeric;
  v_remaining numeric;
  v_refund integer := 0;
  v_ledger uuid;
  v_sum integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(p_fault, '') not in ('operator', 'member', 'none') then
    return jsonb_build_object('ok', false, 'error', 'fault_required');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;
  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.order_status not in ('active', 'paused') then
    return jsonb_build_object('ok', false, 'error', 'not_running');
  end if;
  select abs(amount) into v_paid from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text and entry_type = 'spend'
   order by created_at limit 1;
  v_total := greatest(1, v_row.duration_days) * 86400.0;
  v_paused := coalesce(v_row.paused_seconds_total, 0)
    + case when v_row.order_status = 'paused' and v_row.paused_at is not null
           then greatest(0, extract(epoch from (now() - v_row.paused_at))) else 0 end;
  v_used := greatest(0, extract(epoch from (now() - v_row.start_at)) - v_paused);
  v_remaining := greatest(0, least(v_total, v_total - v_used));
  if p_fault = 'operator' and coalesce(v_paid, 0) > 0 then
    v_refund := floor(v_paid * v_remaining / v_total)::integer;
  end if;
  if p_preview then
    return jsonb_build_object('ok', true, 'preview', true, 'refund_points', v_refund,
      'paid_points', coalesce(v_paid, 0), 'remaining_seconds', floor(v_remaining),
      'has_payment_record', v_paid is not null);
  end if;
  if v_refund > 0 then
    perform 1 from public.profiles where id = v_row.user_id for update;
    v_sum := public.sum_user_point_ledger(v_row.user_id);
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
    values
      (v_row.user_id, 'refund', v_refund, v_sum + v_refund, 'promotion_order', p_order_id::text,
       '홍보 종료 환급 (운영 사유)', 'admin', p_actor_id)
    returning id into v_ledger;
    perform public.project_user_point_balance_from_ledger(v_row.user_id);
  end if;
  update public.point_promotion_orders
     set order_status = 'ended', ended_at = now(), end_at = least(end_at, now()), paused_at = null,
         paused_seconds_total = floor(v_paused)::integer, ended_by = p_actor_id,
         end_reason_code = left(coalesce(p_reason_code, 'admin_end'), 64), fault = p_fault,
         review_reason = left(trim(p_reason), 500), refund_points = v_refund, refund_ledger_id = v_ledger
   where id = p_order_id;
  return jsonb_build_object('ok', true, 'order_status', 'ended', 'refund_points', v_refund,
    'refund_ledger_id', v_ledger, 'has_payment_record', v_paid is not null);
end; $function$
;

-- admin_trade_promotion_end md5=d0634556785149d606ac75c5492948d9
CREATE OR REPLACE FUNCTION public.admin_trade_promotion_end(p_order_id uuid, p_actor_id uuid, p_reason_code text, p_fault text, p_reason text, p_preview boolean DEFAULT false, p_ip text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_paid integer;
  v_total numeric;
  v_paused numeric;
  v_used numeric;
  v_remaining numeric;
  v_refund integer := 0;
  v_ledger uuid;
  v_sum integer;
begin
  if (select auth.role()) is distinct from 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if coalesce(p_fault, '') not in ('operator', 'member', 'none') then
    return jsonb_build_object('ok', false, 'error', 'fault_required');
  end if;
  if coalesce(length(trim(p_reason)), 0) < 2 then
    return jsonb_build_object('ok', false, 'error', 'reason_required');
  end if;

  select * into v_row from public.point_promotion_orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_row.domain <> 'trade' then return jsonb_build_object('ok', false, 'error', 'not_trade'); end if;
  if v_row.order_status not in ('active', 'paused') then
    return jsonb_build_object('ok', false, 'error', 'already_processed', 'order_status', v_row.order_status);
  end if;

  select abs(amount) into v_paid from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text and entry_type = 'spend'
   order by created_at limit 1;
  if v_paid is null then
    select h.amount into v_paid from public.promotion_point_holds h
     where h.promotion_order_id = p_order_id and h.status = 'captured';
  end if;

  v_total := greatest(1, v_row.duration_days) * 86400.0;
  v_paused := coalesce(v_row.paused_seconds_total, 0)
    + case when v_row.order_status = 'paused' and v_row.paused_at is not null
           then greatest(0, extract(epoch from (now() - v_row.paused_at))) else 0 end;
  v_used := greatest(0, extract(epoch from (now() - v_row.start_at)) - v_paused);
  v_remaining := greatest(0, least(v_total, v_total - v_used));
  if p_fault = 'operator' and coalesce(v_paid, 0) > 0 then
    v_refund := floor(v_paid * v_remaining / v_total)::integer;
  end if;

  if p_preview then
    return jsonb_build_object('ok', true, 'preview', true, 'refund_points', v_refund,
      'paid_points', coalesce(v_paid, 0), 'remaining_seconds', floor(v_remaining),
      'has_payment_record', v_paid is not null);
  end if;

  if v_refund > 0 then
    perform 1 from public.profiles where id = v_row.user_id for update;
    v_sum := public.sum_user_point_ledger(v_row.user_id);
    insert into public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id)
    values
      (v_row.user_id, 'refund', v_refund, v_sum + v_refund, 'promotion_order', p_order_id::text,
       '거래 상위노출 종료 환급 (운영 사유)', 'admin', p_actor_id)
    returning id into v_ledger;
    perform public.project_user_point_balance_from_ledger(v_row.user_id);
  end if;

  update public.point_promotion_orders
     set order_status = 'ended', ended_at = now(), end_at = least(end_at, now()), paused_at = null,
         paused_seconds_total = floor(v_paused)::integer, ended_by = p_actor_id,
         end_reason_code = left(coalesce(p_reason_code, 'admin_end'), 64), fault = p_fault,
         review_reason = left(trim(p_reason), 500), refund_points = v_refund, refund_ledger_id = v_ledger
   where id = p_order_id;

  perform public.trade_promotion_audit('admin', p_actor_id, p_order_id, 'end',
    jsonb_build_object('order_status', v_row.order_status, 'end_at', v_row.end_at),
    jsonb_build_object('order_status', 'ended', 'fault', p_fault, 'refund_points', v_refund,
                       'refund_ledger_id', v_ledger, 'reason', left(trim(p_reason), 500)),
    p_ip, p_user_agent);

  return jsonb_build_object('ok', true, 'order_status', 'ended', 'refund_points', v_refund,
    'refund_ledger_id', v_ledger, 'has_payment_record', v_paid is not null);
end;
$function$
;

-- purchase_member_community_promotion md5=53d1778d625f3ef24be51aff7fd89d3d
CREATE OR REPLACE FUNCTION public.purchase_member_community_promotion(p_user_id uuid, p_target_id text, p_product_id text, p_point_cost integer, p_duration_days integer, p_placement text, p_idempotency_key text, p_user_nickname text DEFAULT ''::text, p_target_title text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_post record;
  v_sum integer;
  v_cache integer;
  v_balance_after integer;
  v_order_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_existing_id uuid;
  v_existing_status text;
  v_existing_start timestamptz;
  v_existing_end timestamptz;
  v_existing_cost integer;
  v_existing_product text;
  v_title text;
  v_nick text;
  v_key text;
  v_status text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_key := trim(coalesce(p_idempotency_key, ''));
  IF p_user_id IS NULL OR coalesce(trim(p_target_id), '') = '' OR v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF coalesce(trim(p_product_id), '') = '' OR p_point_cost IS NULL OR p_point_cost < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 90 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;

  -- Idempotent replay (same key → same entitlement, no second debit)
  SELECT id, order_status, start_at, end_at, point_cost, product_id
    INTO v_existing_id, v_existing_status, v_existing_start, v_existing_end,
         v_existing_cost, v_existing_product
    FROM public.point_promotion_orders
   WHERE user_id = p_user_id
     AND idempotency_key = v_key
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_existing_id,
      'status', coalesce(v_existing_status, 'active'),
      'start_at', v_existing_start,
      'end_at', v_existing_end,
      'point_cost', coalesce(v_existing_cost, p_point_cost),
      'product_id', coalesce(nullif(trim(v_existing_product), ''), trim(p_product_id)),
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
  END IF;

  SELECT id, title, user_id, status, is_hidden
    INTO v_post
    FROM public.community_posts
   WHERE id::text = trim(p_target_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_not_found');
  END IF;
  IF v_post.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF coalesce(v_post.is_hidden, false) IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_unavailable');
  END IF;
  v_status := lower(coalesce(v_post.status, 'active'));
  IF v_status <> '' AND v_status NOT IN ('active', 'published') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_unavailable');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.point_promotion_orders
     WHERE domain = 'community'
       AND target_id = trim(p_target_id)
       AND order_status IN ('pending_review', 'active', 'paused')
       AND (order_status = 'pending_review' OR end_at >= now())
     LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_active_promotion');
  END IF;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(p_user_id);
  IF coalesce(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
    PERFORM public.project_user_point_balance_from_ledger(p_user_id);
    v_sum := public.sum_user_point_ledger(p_user_id);
  END IF;

  IF GREATEST(0, v_sum) < p_point_cost THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'code', 'insufficient_balance'
    );
  END IF;

  v_balance_after := GREATEST(0, v_sum) - p_point_cost;
  v_order_id := gen_random_uuid();
  v_start := now();
  v_end := v_start + make_interval(days => p_duration_days);
  v_title := coalesce(nullif(trim(p_target_title), ''), nullif(trim(v_post.title), ''), '');
  v_nick := coalesce(nullif(trim(p_user_nickname), ''), '');

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_user_id,
    'spend',
    -p_point_cost,
    v_balance_after,
    'promotion_order',
    v_order_id::text,
    left('커뮤니티 게시물 상위 노출 (' || p_duration_days || '일)', 500),
    'user'
  );

  INSERT INTO public.point_promotion_orders (
    id, user_id, user_nickname, target_type, target_id, target_title,
    placement, duration_days, point_cost, order_status, start_at, end_at,
    product_id, domain, idempotency_key
  ) VALUES (
    v_order_id,
    p_user_id,
    v_nick,
    'community_post',
    trim(p_target_id),
    v_title,
    coalesce(nullif(trim(p_placement), ''), 'community_top_pin'),
    p_duration_days,
    p_point_cost,
    'active',
    v_start,
    v_end,
    trim(p_product_id),
    'community',
    v_key
  );

  PERFORM public.project_user_point_balance_from_ledger(p_user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'status', 'active',
    'balance_after', v_balance_after,
    'start_at', v_start,
    'end_at', v_end,
    'point_cost', p_point_cost,
    'product_id', trim(p_product_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT id, order_status, start_at, end_at, point_cost, product_id
      INTO v_existing_id, v_existing_status, v_existing_start, v_existing_end,
           v_existing_cost, v_existing_product
      FROM public.point_promotion_orders
     WHERE user_id = p_user_id
       AND idempotency_key = v_key
     LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_existing_id,
      'status', coalesce(v_existing_status, 'active'),
      'start_at', v_existing_start,
      'end_at', v_existing_end,
      'point_cost', coalesce(v_existing_cost, p_point_cost),
      'product_id', coalesce(nullif(trim(v_existing_product), ''), trim(p_product_id)),
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
END;
$function$
;

-- purchase_member_content_promotion md5=daf1746ac18b35e4e3a6d5ede149d34f
CREATE OR REPLACE FUNCTION public.purchase_member_content_promotion(p_user_id uuid, p_target_id text, p_product_id text, p_point_cost integer, p_duration_days integer, p_placement text, p_domain text, p_idempotency_key text, p_user_nickname text DEFAULT ''::text, p_target_title text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_post record;
  v_sum integer;
  v_cache integer;
  v_balance_after integer;
  v_order_id uuid;
  v_start timestamptz;
  v_end timestamptz;
  v_existing_id uuid;
  v_title text;
  v_nick text;
  v_key text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  v_key := trim(coalesce(p_idempotency_key, ''));
  IF p_user_id IS NULL OR coalesce(trim(p_target_id), '') = '' OR v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF coalesce(trim(p_product_id), '') = '' OR p_point_cost IS NULL OR p_point_cost < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;

  IF p_duration_days IS NULL OR p_duration_days < 1 OR p_duration_days > 90 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_duration');
  END IF;

  -- Idempotent replay (same key → same entitlement, no second debit)
  SELECT id INTO v_existing_id
    FROM public.point_promotion_orders
   WHERE user_id = p_user_id
     AND idempotency_key = v_key
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_existing_id,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
  END IF;

  SELECT id, title, user_id, status, seller_listing_state
    INTO v_post
    FROM public.posts
   WHERE id::text = trim(p_target_id)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_not_found');
  END IF;
  IF v_post.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF lower(coalesce(v_post.status, 'active')) IN (
    'deleted', 'hidden', 'sold', 'suspended', 'blocked', 'blinded'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_unavailable');
  END IF;
  -- PR-2: 판매 단계 「거래완료」 글도 홍보할 수 없다(상태가 아직 sold 가 아니어도)
  IF lower(coalesce(v_post.seller_listing_state, '')) = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_unavailable');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.point_promotion_orders
     WHERE target_type = 'product'
       AND target_id = trim(p_target_id)
       AND order_status IN ('active', 'paused')
       AND end_at >= now()
     LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_active_promotion');
  END IF;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(p_user_id);
  IF coalesce(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
    PERFORM public.project_user_point_balance_from_ledger(p_user_id);
    v_sum := public.sum_user_point_ledger(p_user_id);
  END IF;

  IF GREATEST(0, v_sum) < p_point_cost THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_balance',
      'code', 'insufficient_balance'
    );
  END IF;

  v_balance_after := GREATEST(0, v_sum) - p_point_cost;
  v_order_id := gen_random_uuid();
  v_start := now();
  v_end := v_start + make_interval(days => p_duration_days);
  v_title := coalesce(nullif(trim(p_target_title), ''), nullif(trim(v_post.title), ''), '');
  v_nick := coalesce(nullif(trim(p_user_nickname), ''), '');

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_user_id,
    'spend',
    -p_point_cost,
    v_balance_after,
    'promotion_order',
    v_order_id::text,
    left(CASE WHEN coalesce(nullif(trim(p_domain), ''), 'trade') = 'trade' THEN '거래 상위노출 ' || p_duration_days || '일' ELSE '프로모션 구매 (' || trim(p_product_id) || ', ' || p_duration_days || '일)' END, 500),
    'user'
  );

  INSERT INTO public.point_promotion_orders (
    id, user_id, user_nickname, target_type, target_id, target_title,
    placement, duration_days, point_cost, order_status, start_at, end_at,
    product_id, domain, idempotency_key
  ) VALUES (
    v_order_id,
    p_user_id,
    v_nick,
    'product',
    trim(p_target_id),
    v_title,
    coalesce(nullif(trim(p_placement), ''), 'feed_boost'),
    p_duration_days,
    p_point_cost,
    'active',
    v_start,
    v_end,
    trim(p_product_id),
    coalesce(nullif(trim(p_domain), ''), 'trade'),
    v_key
  );

  PERFORM public.project_user_point_balance_from_ledger(p_user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'balance_after', v_balance_after,
    'start_at', v_start,
    'end_at', v_end,
    'point_cost', p_point_cost,
    'product_id', trim(p_product_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_id
      FROM public.point_promotion_orders
     WHERE user_id = p_user_id
       AND idempotency_key = v_key
     LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_existing_id,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
END;
$function$
;

-- purchase_member_content_promotion_v2 md5=c774243470dd1b295b128346f9b59365
CREATE OR REPLACE FUNCTION public.purchase_member_content_promotion_v2(p_user_id uuid, p_target_id text, p_product_id text, p_expected_point_cost integer, p_expected_duration_days integer, p_idempotency_key text, p_user_nickname text DEFAULT ''::text, p_target_title text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_product public.member_promotion_products%ROWTYPE;
  v_existing_id uuid;
  v_res jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  -- 같은 요청 다시 보내기: 가격이 그 사이 바뀌었어도 이미 만든 주문을 그대로 돌려준다 (두 번 차감 없음)
  SELECT id INTO v_existing_id
    FROM public.point_promotion_orders
   WHERE user_id = p_user_id AND idempotency_key = trim(coalesce(p_idempotency_key, ''))
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'order_id', v_existing_id,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
  END IF;

  -- FOR SHARE: 결제 중에는 어드민 변경(FOR UPDATE)이 기다린다
  SELECT * INTO v_product
    FROM public.member_promotion_products
   WHERE id = trim(coalesce(p_product_id, ''))
   FOR SHARE;
  IF NOT FOUND OR v_product.domain <> 'trade' OR NOT v_product.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;
  IF v_product.point_cost IS DISTINCT FROM p_expected_point_cost
     OR v_product.duration_days IS DISTINCT FROM p_expected_duration_days THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'price_changed',
      'point_cost', v_product.point_cost,
      'duration_days', v_product.duration_days,
      'revision', v_product.revision
    );
  END IF;

  v_res := public.purchase_member_content_promotion(
    p_user_id, p_target_id, v_product.id, v_product.point_cost, v_product.duration_days,
    v_product.placement, v_product.domain, p_idempotency_key, p_user_nickname, p_target_title
  );

  IF coalesce((v_res ->> 'ok')::boolean, false)
     AND coalesce((v_res ->> 'idempotent')::boolean, false) IS NOT TRUE
     AND (v_res ->> 'order_id') IS NOT NULL THEN
    UPDATE public.point_promotion_orders
       SET product_revision = v_product.revision
     WHERE id = (v_res ->> 'order_id')::uuid;
    v_res := v_res || jsonb_build_object('product_revision', v_product.revision);
  END IF;
  RETURN v_res;
END;
$function$
;
