-- 재감사 E-15 적용 직전 운영 함수 정의 원문 (2026-11-03 PHT, 프로젝트 ckdosyydvgzqwpbwuhon)
-- 되돌리기: 이 파일을 그대로 실행하면 E-15 이전(R2 적용 상태) 정의로 돌아간다. 각 블록 위 md5 = pg_get_functiondef md5.

-- purchase_member_community_promotion md5=f79399bb43324e614332534c5d394d87
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
  v_running record; -- R2 연장 대상 주문
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

  -- R2 연장: 같은 요청 재전송(연장 원장 키) → 그대로 돌려준다
  SELECT related_id::uuid INTO v_existing_id
    FROM public.point_ledger
   WHERE related_type = 'promotion_order' AND idempotency_key = v_key AND entry_type = 'promotion_extend'
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    SELECT order_status, start_at, end_at INTO v_existing_status, v_existing_start, v_existing_end
      FROM public.point_promotion_orders WHERE id = v_existing_id;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'extended', true, 'order_id', v_existing_id,
      'status', coalesce(v_existing_status, 'active'), 'start_at', v_existing_start, 'end_at', v_existing_end,
      'point_cost', p_point_cost, 'product_id', trim(p_product_id),
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
  END IF;

  SELECT id, order_status, user_id, start_at, end_at INTO v_running
    FROM public.point_promotion_orders
   WHERE domain = 'community'
     AND target_id = trim(p_target_id)
     AND order_status IN ('pending_review', 'active', 'paused')
     AND (order_status = 'pending_review' OR end_at >= now())
   ORDER BY end_at DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    IF v_running.order_status <> 'active' OR v_running.user_id IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_active_promotion');
    END IF;
    SELECT points INTO v_cache FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
    END IF;
    v_sum := public.sum_user_point_ledger(p_user_id);
    IF coalesce(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
      PERFORM public.project_user_point_balance_from_ledger(p_user_id);
      v_sum := public.sum_user_point_ledger(p_user_id);
    END IF;
    IF GREATEST(0, v_sum) < p_point_cost THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'code', 'insufficient_balance');
    END IF;
    v_balance_after := GREATEST(0, v_sum) - p_point_cost;
    INSERT INTO public.point_ledger (
      user_id, entry_type, amount, balance_after,
      related_type, related_id, description, actor_type, idempotency_key
    ) VALUES (
      p_user_id, 'promotion_extend', -p_point_cost, v_balance_after,
      'promotion_order', v_running.id::text,
      left('커뮤니티 게시물 상위 노출 연장 (' || p_duration_days || '일)', 500), 'user', v_key
    );
    UPDATE public.point_promotion_orders
       SET end_at = end_at + make_interval(days => p_duration_days),
           duration_days = duration_days + p_duration_days,
           point_cost = point_cost + p_point_cost
     WHERE id = v_running.id
     RETURNING end_at INTO v_end;
    PERFORM public.project_user_point_balance_from_ledger(p_user_id);
    RETURN jsonb_build_object(
      'ok', true, 'extended', true, 'order_id', v_running.id, 'status', 'active',
      'balance_after', v_balance_after, 'start_at', v_running.start_at, 'end_at', v_end,
      'point_cost', p_point_cost, 'product_id', trim(p_product_id)
    );
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
    IF v_existing_id IS NULL THEN -- R2: 연장 원장 키로 다시 찾기
      SELECT o.id, o.order_status, o.start_at, o.end_at, o.point_cost, o.product_id
        INTO v_existing_id, v_existing_status, v_existing_start, v_existing_end,
             v_existing_cost, v_existing_product
        FROM public.point_ledger l
        JOIN public.point_promotion_orders o ON o.id::text = l.related_id
       WHERE l.related_type = 'promotion_order' AND l.idempotency_key = v_key AND l.entry_type = 'promotion_extend'
       LIMIT 1;
    END IF;
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

-- purchase_member_content_promotion md5=d5bead6df383c81157c59454f25503dd
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
  v_running record; -- R2 연장 대상 주문
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

  -- R2 연장: 같은 요청 재전송(연장 원장 키) → 그대로 돌려준다
  SELECT related_id::uuid INTO v_existing_id
    FROM public.point_ledger
   WHERE related_type = 'promotion_order' AND idempotency_key = v_key AND entry_type = 'promotion_extend'
   LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'extended', true, 'order_id', v_existing_id,
      'end_at', (SELECT end_at FROM public.point_promotion_orders WHERE id = v_existing_id),
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
  END IF;

  SELECT id, order_status, user_id, end_at INTO v_running
    FROM public.point_promotion_orders
   WHERE target_type = 'product'
     AND target_id = trim(p_target_id)
     AND order_status IN ('active', 'paused')
     AND end_at >= now()
   ORDER BY end_at DESC
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    IF v_running.order_status <> 'active' OR v_running.user_id IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_active_promotion');
    END IF;
    SELECT points INTO v_cache FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
    END IF;
    v_sum := public.sum_user_point_ledger(p_user_id);
    IF coalesce(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
      PERFORM public.project_user_point_balance_from_ledger(p_user_id);
      v_sum := public.sum_user_point_ledger(p_user_id);
    END IF;
    IF GREATEST(0, v_sum) < p_point_cost THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'code', 'insufficient_balance');
    END IF;
    v_balance_after := GREATEST(0, v_sum) - p_point_cost;
    INSERT INTO public.point_ledger (
      user_id, entry_type, amount, balance_after,
      related_type, related_id, description, actor_type, idempotency_key
    ) VALUES (
      p_user_id, 'promotion_extend', -p_point_cost, v_balance_after,
      'promotion_order', v_running.id::text,
      left('거래 상위노출 연장 ' || p_duration_days || '일', 500), 'user', v_key
    );
    UPDATE public.point_promotion_orders
       SET end_at = end_at + make_interval(days => p_duration_days),
           duration_days = duration_days + p_duration_days,
           point_cost = point_cost + p_point_cost
     WHERE id = v_running.id
     RETURNING end_at INTO v_end;
    PERFORM public.project_user_point_balance_from_ledger(p_user_id);
    RETURN jsonb_build_object(
      'ok', true, 'extended', true, 'order_id', v_running.id,
      'balance_after', v_balance_after, 'end_at', v_end,
      'point_cost', p_point_cost, 'product_id', trim(p_product_id)
    );
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
    IF v_existing_id IS NULL THEN -- R2: 연장 원장 키로 다시 찾기
      SELECT related_id::uuid INTO v_existing_id
        FROM public.point_ledger
       WHERE related_type = 'promotion_order' AND idempotency_key = v_key AND entry_type = 'promotion_extend'
       LIMIT 1;
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'order_id', v_existing_id,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id)
    );
END;
$function$
;
