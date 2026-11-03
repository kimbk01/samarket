-- 재감사 R2 상위노출 새 규칙 (Owner 2026-11-03 「기간 이전에 추가 포인트를 결제하고 추가 신청하면 연장」 · D-1·D-4 권장안)
-- 설계: docs/audit/ads-reaudit-final-2026-11-03.md §2 · 시안 docs/audit/trade-boost-new-rules-mockup-2026-11-03.html
--
-- 1) 거래·커뮤니티 결제 함수: 같은 회원의 「광고 중(active)」 주문이 있는 글에 다시 결제하면 새 주문 대신 **그 주문을 연장**한다.
--    · end_at += 기간, duration_days += 기간, point_cost += 금액. start_at 은 그대로(D-1: 목록 자리 유지).
--    · 원장: related_type='promotion_order', related_id=주문 id, entry_type='promotion_extend', idempotency_key=요청 키.
--      (주문당 spend 1행 고유 규칙 uq_point_ledger_promotion_order_once 에 걸리지 않고, 같은 요청 재전송은
--       uq_point_ledger_idempotency_key(related_type, idempotency_key) 로 한 번만 차감.)
--    · 일시정지(paused)·심사 중(pending_review) 주문이면 지금처럼 already_active_promotion.
-- 2) 거래 v2: 연장이면 주문의 product_revision 을 덮어쓰지 않는다.
-- 3) 운영 종료 환급(거래·커뮤니티): 첫 결제 1건 → 그 주문의 결제 **합계**(spend + promotion_extend) 기준.
-- 방법: 운영 함수 정의를 읽어 정해진 블록만 바꾼다. 바꿀 블록이 없으면 오류로 멈춘다(이미 바뀐 정의면 건너뜀).
-- 되돌리기: docs/audit/promotion-extend-backup-2026-11-03.sql (적용 직전 정의 원문).

CREATE OR REPLACE FUNCTION public._ads_r2_replace_once(p_name text, p_old text, p_new text, p_marker text)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE
  v_oid oid;
  v_def text;
BEGIN
  SELECT p.oid INTO STRICT v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = p_name;
  v_def := pg_get_functiondef(v_oid);
  IF position(p_marker IN v_def) > 0 THEN
    RETURN; -- 이미 적용됨
  END IF;
  IF (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1) <> 1 THEN
    RAISE EXCEPTION '%: 바꿀 블록이 정확히 1번 있어야 함', p_name;
  END IF;
  EXECUTE replace(v_def, p_old, p_new);
END $$;

-- ── 1-a) 거래 결제: 연장 ───────────────────────────────────────────────
-- 연장 경로에서 쓰는 변수 선언 추가
SELECT public._ads_r2_replace_once(
  'purchase_member_content_promotion',
  $old$  v_key text;
BEGIN$old$,
  $new$  v_key text;
  v_running record; -- R2 연장 대상 주문
BEGIN$new$,
  'v_running record; -- R2'
);

SELECT public._ads_r2_replace_once(
  'purchase_member_content_promotion',
  $old$  IF EXISTS (
    SELECT 1 FROM public.point_promotion_orders
     WHERE target_type = 'product'
       AND target_id = trim(p_target_id)
       AND order_status IN ('active', 'paused')
       AND end_at >= now()
     LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_active_promotion');
  END IF;
$old$,
  $new$  -- R2 연장: 같은 요청 재전송(연장 원장 키) → 그대로 돌려준다
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
$new$,
  'R2 연장: 같은 요청 재전송'
);

-- 동시에 같은 키로 두 번 들어와 연장 원장 고유 규칙에 걸렸을 때도 같은 결과를 돌려준다
SELECT public._ads_r2_replace_once(
  'purchase_member_content_promotion',
  $old$EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_id
      FROM public.point_promotion_orders
     WHERE user_id = p_user_id
       AND idempotency_key = v_key
     LIMIT 1;
$old$,
  $new$EXCEPTION
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
$new$,
  'R2: 연장 원장 키로 다시 찾기'
);

-- ── 1-b) 커뮤니티 결제: 연장 ───────────────────────────────────────────
-- 연장 경로에서 쓰는 변수 선언 추가 (본문 교체보다 먼저 — 선언 없이 본문을 만들면 컴파일 오류)
SELECT public._ads_r2_replace_once(
  'purchase_member_community_promotion',
  $old$  v_status text;
BEGIN$old$,
  $new$  v_status text;
  v_running record; -- R2 연장 대상 주문
BEGIN$new$,
  'v_running record; -- R2'
);

SELECT public._ads_r2_replace_once(
  'purchase_member_community_promotion',
  $old$  IF EXISTS (
    SELECT 1 FROM public.point_promotion_orders
     WHERE domain = 'community'
       AND target_id = trim(p_target_id)
       AND order_status IN ('pending_review', 'active', 'paused')
       AND (order_status = 'pending_review' OR end_at >= now())
     LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_active_promotion');
  END IF;
$old$,
  $new$  -- R2 연장: 같은 요청 재전송(연장 원장 키) → 그대로 돌려준다
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
$new$,
  'R2 연장: 같은 요청 재전송'
);

SELECT public._ads_r2_replace_once(
  'purchase_member_community_promotion',
  $old$EXCEPTION
  WHEN unique_violation THEN
    SELECT id, order_status, start_at, end_at, point_cost, product_id
      INTO v_existing_id, v_existing_status, v_existing_start, v_existing_end,
           v_existing_cost, v_existing_product
      FROM public.point_promotion_orders
     WHERE user_id = p_user_id
       AND idempotency_key = v_key
     LIMIT 1;
$old$,
  $new$EXCEPTION
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
$new$,
  'R2: 연장 원장 키로 다시 찾기'
);

-- ── 2) 거래 v2: 연장이면 product_revision 덮어쓰지 않음 ────────────────
SELECT public._ads_r2_replace_once(
  'purchase_member_content_promotion_v2',
  $old$  IF coalesce((v_res ->> 'ok')::boolean, false)
     AND coalesce((v_res ->> 'idempotent')::boolean, false) IS NOT TRUE
     AND (v_res ->> 'order_id') IS NOT NULL THEN$old$,
  $new$  IF coalesce((v_res ->> 'ok')::boolean, false)
     AND coalesce((v_res ->> 'idempotent')::boolean, false) IS NOT TRUE
     AND coalesce((v_res ->> 'extended')::boolean, false) IS NOT TRUE -- R2: 연장은 원래 주문 가격 버전 유지
     AND (v_res ->> 'order_id') IS NOT NULL THEN$new$,
  'R2: 연장은 원래 주문 가격 버전 유지'
);

-- ── 3) 운영 종료 환급: 결제 합계 기준 ──────────────────────────────────
SELECT public._ads_r2_replace_once(
  'admin_trade_promotion_end',
  $old$  select abs(amount) into v_paid from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text and entry_type = 'spend'
   order by created_at limit 1;$old$,
  $new$  -- R2: 첫 결제 + 연장 결제 합계 (연장하면 duration_days 도 늘어 남은 비율과 맞는다)
  select nullif(coalesce(sum(abs(amount)), 0), 0)::integer into v_paid from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text
     and entry_type in ('spend', 'promotion_extend');$new$,
  'R2: 첫 결제 + 연장 결제 합계'
);

SELECT public._ads_r2_replace_once(
  'admin_promotion_end',
  $old$  select abs(amount) into v_paid from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text and entry_type = 'spend'
   order by created_at limit 1;$old$,
  $new$  -- R2: 첫 결제 + 연장 결제 합계 (연장하면 duration_days 도 늘어 남은 비율과 맞는다)
  select nullif(coalesce(sum(abs(amount)), 0), 0)::integer into v_paid from public.point_ledger
   where related_type = 'promotion_order' and related_id = p_order_id::text
     and entry_type in ('spend', 'promotion_extend');$new$,
  'R2: 첫 결제 + 연장 결제 합계'
);

DROP FUNCTION public._ads_r2_replace_once(text, text, text, text);
