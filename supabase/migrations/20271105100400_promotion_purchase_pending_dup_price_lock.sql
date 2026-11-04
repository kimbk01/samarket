-- 광고 수정 설계 2026-11-04 · PB-39 · PB-40 (상위노출 결제 함수)
-- 근거: docs/audit/ads-fix-design-2026-11-04.md §3 PB-39 · PB-40
-- 기준 = 운영 현재 정의 (2026-11-04 pg_get_functiondef). 바꾼 부분만 「PB-39」「PB-40」 주석으로 표시. 나머지는 운영과 글자 그대로.
--
-- PB-39: purchase_member_content_promotion_v2 — 같은 거래 글에 심사 중(pending_review) 주문이 있으면
--        already_active_promotion 으로 거절(커뮤니티 결제 함수의 중복 검사와 같게). 가격 확인 다음 · 내부 결제 호출 전.
--        (실제 진행 중 중복 검사 active|paused 는 내부 purchase_member_content_promotion 에 그대로 있음 — 그 함수는 바꾸지 않음)
-- PB-40: purchase_member_community_promotion — 상품 가격을 함수 안에서 member_promotion_products 에서 다시 읽고 잠근다(FOR SHARE).
--        넘어온 p_point_cost / p_duration_days 와 다르면 차감 없이
--        {ok:false, error:'price_changed', point_cost, duration_days, revision} (v2 와 같은 모양 · 라우트 priceChangedResponse 와 같은 이름).
--        상품이 없거나 community 가 아니거나 꺼져 있으면 invalid_product. 같은 키 재전송(주문·연장 원장)은 가격 확인보다 먼저 처음 결과를 돌려준다.
--
-- 롤백 SQL: 이 파일의 두 CREATE OR REPLACE 본문에서 표시 블록만 지운 것 = 운영 이전 정의(2026-11-04) 그대로.
--   · v2: 「PB-39」 IF EXISTS 블록 삭제 후 같은 CREATE OR REPLACE 실행
--   · community: 「PB-40」 SELECT·IF 블록과 v_product 선언 삭제 후 같은 CREATE OR REPLACE 실행

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

  -- PB-39: 심사 중 주문이 있는 글은 새로 결제하지 않는다 (커뮤니티 중복 검사와 같음)
  IF EXISTS (
    SELECT 1 FROM public.point_promotion_orders
     WHERE target_type = 'product'
       AND target_id = trim(coalesce(p_target_id, ''))
       AND order_status = 'pending_review'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_active_promotion');
  END IF;

  v_res := public.purchase_member_content_promotion(
    p_user_id, p_target_id, v_product.id, v_product.point_cost, v_product.duration_days,
    v_product.placement, v_product.domain, p_idempotency_key, p_user_nickname, p_target_title
  );

  IF coalesce((v_res ->> 'ok')::boolean, false)
     AND coalesce((v_res ->> 'idempotent')::boolean, false) IS NOT TRUE
     AND coalesce((v_res ->> 'extended')::boolean, false) IS NOT TRUE -- R2: 연장은 원래 주문 가격 버전 유지
     AND (v_res ->> 'order_id') IS NOT NULL THEN
    UPDATE public.point_promotion_orders
       SET product_revision = v_product.revision
     WHERE id = (v_res ->> 'order_id')::uuid;
    v_res := v_res || jsonb_build_object('product_revision', v_product.revision);
  END IF;
  RETURN v_res;
END;
$function$;

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
  v_product public.member_promotion_products%ROWTYPE; -- PB-40
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

  -- PB-40: 가격을 함수 안에서 다시 읽고 잠근다 (FOR SHARE: 결제 중 어드민 가격 변경(FOR UPDATE)은 기다린다)
  SELECT * INTO v_product
    FROM public.member_promotion_products
   WHERE id = trim(p_product_id)
   FOR SHARE;
  IF NOT FOUND OR v_product.domain <> 'community' OR NOT v_product.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_product');
  END IF;
  IF v_product.point_cost IS DISTINCT FROM p_point_cost
     OR v_product.duration_days IS DISTINCT FROM p_duration_days THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'price_changed',
      'point_cost', v_product.point_cost,
      'duration_days', v_product.duration_days,
      'revision', v_product.revision
    );
  END IF;

  SELECT id, order_status, user_id, start_at, end_at INTO v_running
    FROM public.point_promotion_orders
   WHERE domain = 'community'
     AND target_id = trim(p_target_id)
     AND order_status IN ('pending_review', 'active', 'paused')
     AND (order_status IN ('pending_review', 'paused') OR end_at >= now()) -- E-15: 일시정지는 기간이 멈춰 있어 종료일과 관계없이 진행 중
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
$function$;

-- 권한은 운영과 같게 유지 (CREATE OR REPLACE 는 ACL 을 바꾸지 않지만 명시)
REVOKE ALL ON FUNCTION public.purchase_member_content_promotion_v2(uuid, text, text, integer, integer, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_member_content_promotion_v2(uuid, text, text, integer, integer, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_member_community_promotion(uuid, text, text, integer, integer, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_member_community_promotion(uuid, text, text, integer, integer, text, text, text, text) TO service_role;
