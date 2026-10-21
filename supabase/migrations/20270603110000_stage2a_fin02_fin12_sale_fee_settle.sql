-- 배달 오너 감사 2단계 2-A · FIN-02 · FIN-12 (문서 G-1 §5-A, Owner 승인 2026-10-21)
-- 운영 원문 기준(읽기 전용 pg_get_functiondef, 2026-10-21 PHT) 최소 diff:
--   public.settle_store_sale_fee_obligations(uuid)                         base md5(prosrc) = e600e0e0256a091371f1da793e067645
--   public.admin_decide_store_commission_adjustment(uuid,uuid,text,bigint,text,text) base md5(prosrc) = 731ad5fe62d7ae8589186ae76c71254a
--
-- FIN-02 원인: 상계 원장 멱등 키 'sale_fee_settle:' || 의무 || ':' || 금액 + business_cash_ledger_idem_uidx UNIQUE
--   → 같은 의무에 같은 금액 부분 상계가 두 번이면 unique_violation → 호출자(충전 승인 · Coin 전환) 전체 롤백.
-- FIN-02 수정: 키에 상계 직전 누적 납부액(fee_paid_minor)을 넣는다 — 상계마다 단조 증가라 유일.
--   (환급 승인은 의무당 1회(store_commission_adjustments_one_per_obligation)이고 환급분이 생기면 미납이 0 이 되어
--    그 의무에 추가 상계가 생기지 않으므로 납부액 감소 후 키 재사용은 일어나지 않는다.)
--   기존 원장 행 키는 그대로(새 행부터 새 형식). 상계 순서·금액 계산 불변.
-- FIN-12 원인: 수수료 환급 승인으로 캐시가 늘어도 다른 미납 의무를 상계하지 않음(충전·전환과 규칙 불일치).
-- FIN-12 수정: 결정 함수에서 캐시 환급(v_refund > 0)이 생긴 경우 같은 트랜잭션에서 settle_store_sale_fee_obligations 호출.
--   환급 금액 계산·결정 원장(store_commission_adjustments)·불변 트리거 불변. 과거 결정 재처리 없음(D-5).
--   (운영 원문 주석의 비 ASCII 화살표 1개는 ASCII '->' 로 바꿨다 — 동작 무관.)
-- 데이터 변경 없음. 권한(GRANT) 은 CREATE OR REPLACE 로 유지된다.
-- 함수 본문에는 비 ASCII 를 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백: 위 base md5 의 운영 원문(키 = 'sale_fee_settle:' || v_ob.id::text || ':' || v_pay::text,
--       결정 함수에서 settle 호출 · 'obligation_settle' 응답 키 제거)으로 CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.settle_store_sale_fee_obligations(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ob record;
  v_cash_avail bigint;
  v_pay bigint;
  v_bc_bal bigint;
  v_settled integer := 0;
  v_ledger uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  PERFORM public.ensure_business_cash_account(p_store_id);

  LOOP
    SELECT balance_minor INTO v_cash_avail
      FROM public.business_cash_accounts
     WHERE store_id = p_store_id
     FOR UPDATE;
    IF coalesce(v_cash_avail, 0) <= 0 THEN EXIT; END IF;

    SELECT * INTO v_ob
      FROM public.store_sale_fee_obligations
     WHERE store_id = p_store_id AND status = 'open' AND fee_outstanding_minor > 0
     ORDER BY created_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN EXIT; END IF;

    v_pay := LEAST(v_cash_avail, v_ob.fee_outstanding_minor);
    IF v_pay <= 0 THEN EXIT; END IF;

    UPDATE public.business_cash_accounts
       SET balance_minor = balance_minor - v_pay, updated_at = now()
     WHERE store_id = p_store_id
     RETURNING balance_minor INTO v_bc_bal;

    -- FIN-02: key carries the cumulative paid amount before this settlement (strictly increasing per obligation).
    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, meta
    ) VALUES (
      p_store_id, 'SALE_FEE_SETTLEMENT', 'debit', v_pay, v_bc_bal,
      'store_sale_fee_obligation', v_ob.id::text,
      'sale_fee_settle:' || v_ob.id::text || ':' || v_ob.fee_paid_minor::text || ':' || v_pay::text,
      'system',
      jsonb_build_object('order_id', v_ob.order_id, 'obligation_id', v_ob.id)
    ) RETURNING id INTO v_ledger;

    UPDATE public.store_sale_fee_obligations
       SET fee_paid_minor = fee_paid_minor + v_pay,
           fee_outstanding_minor = fee_outstanding_minor - v_pay,
           status = CASE WHEN fee_outstanding_minor - v_pay <= 0 THEN 'settled' ELSE 'open' END,
           settled_at = CASE WHEN fee_outstanding_minor - v_pay <= 0 THEN now() ELSE settled_at END
     WHERE id = v_ob.id;

    v_settled := v_settled + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'settled_count', v_settled);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_decide_store_commission_adjustment(p_admin_user_id uuid, p_order_id uuid, p_decision text, p_approved_minor bigint, p_reason text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_prev public.store_commission_adjustments%ROWTYPE;
  v_store uuid;
  v_ob public.store_sale_fee_obligations%ROWTYPE;
  v_order_status text;
  v_total bigint;
  v_approved bigint := 0;
  v_cancel bigint := 0;
  v_refund bigint := 0;
  v_bal bigint;
  v_ledger uuid;
  v_adj uuid := gen_random_uuid();
  v_new_due bigint;
  v_new_out bigint;
  v_settle jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_required');
  END IF;
  IF p_order_id IS NULL OR v_key IS NULL OR p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  -- Replay of the same request (double click / retry) returns the recorded decision.
  SELECT * INTO v_prev FROM public.store_commission_adjustments WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_prev.order_id IS DISTINCT FROM p_order_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'adjustment_id', v_prev.id,
      'decision', v_prev.decision, 'approved_minor', v_prev.approved_minor,
      'cash_refund_minor', v_prev.cash_refund_minor, 'outstanding_cancel_minor', v_prev.outstanding_cancel_minor);
  END IF;

  SELECT store_id INTO v_store FROM public.store_sale_fee_obligations WHERE order_id = p_order_id;
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'obligation_not_found');
  END IF;

  -- Lock order: cash account -> obligation (same as charge / settle).
  PERFORM public.ensure_business_cash_account(v_store);
  PERFORM 1 FROM public.business_cash_accounts WHERE store_id = v_store FOR UPDATE;
  SELECT * INTO v_ob FROM public.store_sale_fee_obligations WHERE order_id = p_order_id FOR UPDATE;

  IF v_ob.adjustment_status IS DISTINCT FROM 'review_required' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_review', 'adjustment_status', v_ob.adjustment_status);
  END IF;
  SELECT order_status INTO v_order_status FROM public.store_orders WHERE id = p_order_id;
  IF v_order_status IS NULL OR v_order_status NOT IN ('cancelled', 'refunded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_closed', 'order_status', v_order_status);
  END IF;

  v_total := v_ob.fee_paid_minor + v_ob.fee_outstanding_minor;
  IF p_decision = 'approve' THEN
    v_approved := coalesce(p_approved_minor, v_total);
    IF v_approved <= 0 OR v_approved > v_total THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount', 'max_minor', v_total);
    END IF;
    -- Unpaid commission is cancelled first; Cash is refunded only for what was actually paid.
    v_cancel := LEAST(v_approved, v_ob.fee_outstanding_minor);
    v_refund := v_approved - v_cancel;
  END IF;

  IF v_refund > 0 THEN
    UPDATE public.business_cash_accounts
       SET balance_minor = balance_minor + v_refund, updated_at = now()
     WHERE store_id = v_store
     RETURNING balance_minor INTO v_bal;
    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
    ) VALUES (
      v_store, 'SALE_FEE_REVERSAL', 'credit', v_refund, v_bal,
      'store_commission_adjustment', v_adj::text, 'commission_adj:' || v_adj::text, 'admin', p_admin_user_id,
      jsonb_build_object('order_id', p_order_id, 'obligation_id', v_ob.id, 'adjustment_id', v_adj,
                         'approved_minor', v_approved, 'outstanding_cancel_minor', v_cancel)
    ) RETURNING id INTO v_ledger;
  END IF;

  v_new_due := v_ob.fee_due_minor - v_approved;
  v_new_out := v_ob.fee_outstanding_minor - v_cancel;
  UPDATE public.store_sale_fee_obligations
     SET fee_due_minor = v_new_due,
         fee_paid_minor = fee_paid_minor - v_refund,
         fee_outstanding_minor = v_new_out,
         status = CASE WHEN v_new_due = 0 THEN 'waived' WHEN v_new_out = 0 THEN 'settled' ELSE 'open' END,
         settled_at = CASE WHEN v_new_out = 0 THEN coalesce(settled_at, now()) ELSE settled_at END,
         adjustment_status = CASE WHEN p_decision = 'approve' THEN 'refunded' ELSE 'kept' END
   WHERE id = v_ob.id;

  INSERT INTO public.store_commission_adjustments (
    id, obligation_id, order_id, store_id, decision, trigger_status,
    fee_charged_minor, fee_paid_minor_before, fee_outstanding_minor_before,
    approved_minor, cash_refund_minor, outstanding_cancel_minor,
    reason, admin_user_id, cash_ledger_id, idempotency_key
  ) VALUES (
    v_adj, v_ob.id, p_order_id, v_store, p_decision, v_order_status,
    coalesce(v_ob.original_fee_due_minor, v_ob.fee_due_minor), v_ob.fee_paid_minor, v_ob.fee_outstanding_minor,
    v_approved, v_refund, v_cancel,
    v_reason, p_admin_user_id, v_ledger, v_key
  );

  -- FIN-12: refunded Cash settles the store's other open obligations in the same transaction (same rule as top-up / convert).
  IF v_refund > 0 THEN
    v_settle := public.settle_store_sale_fee_obligations(v_store);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'adjustment_id', v_adj, 'decision', p_decision,
    'approved_minor', v_approved, 'cash_refund_minor', v_refund, 'outstanding_cancel_minor', v_cancel,
    'cash_ledger_id', v_ledger, 'obligation_settle', v_settle
  );
END;
$function$;
