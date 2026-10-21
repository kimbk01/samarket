-- Production base bodies (verbatim pg_get_functiondef, read-only, 2026-10-21) of every function the stage 2-A
-- migrations redefine, plus reject_business_cash_charge_request (unchanged, used by the tests).
-- 10_*.test.sql asserts md5(prosrc) of each equals the production md5 before the migrations are applied.
-- (Test file only: the enqueue body keeps the original Korean literals; migrations use ASCII escapes.)

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

    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, meta
    ) VALUES (
      p_store_id, 'SALE_FEE_SETTLEMENT', 'debit', v_pay, v_bc_bal,
      'store_sale_fee_obligation', v_ob.id::text,
      'sale_fee_settle:' || v_ob.id::text || ':' || v_pay::text,
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

CREATE OR REPLACE FUNCTION public.approve_business_cash_charge_request(p_admin_user_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.business_cash_charge_requests%ROWTYPE;
  v_bal bigint;
  v_ledger uuid;
  v_settle jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req FROM public.business_cash_charge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status = 'APPROVED' AND v_req.credit_ledger_id IS NOT NULL THEN
    v_settle := public.settle_store_sale_fee_obligations(v_req.store_id);
    SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_req.store_id;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'ledger_id', v_req.credit_ledger_id,
      'balance_after_minor', coalesce(v_bal, 0),
      'obligation_settle', v_settle
    );
  END IF;
  IF v_req.status IS DISTINCT FROM 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending', 'status', v_req.status);
  END IF;

  PERFORM public.ensure_business_cash_account(v_req.store_id);

  UPDATE public.business_cash_accounts
  SET balance_minor = balance_minor + v_req.amount_minor, updated_at = now()
  WHERE store_id = v_req.store_id
  RETURNING balance_minor INTO v_bal;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_kind, direction, amount_minor, balance_after_minor,
    related_type, related_id, idempotency_key, actor_type, actor_user_id
  ) VALUES (
    v_req.store_id, 'TOP_UP', 'credit', v_req.amount_minor, v_bal,
    'business_cash_charge_request', v_req.id::text,
    'bc_topup:' || v_req.id::text, 'admin', p_admin_user_id
  ) RETURNING id INTO v_ledger;

  UPDATE public.business_cash_charge_requests
  SET status = 'APPROVED',
      admin_user_id = p_admin_user_id,
      decided_at = now(),
      credit_ledger_id = v_ledger,
      updated_at = now()
  WHERE id = v_req.id;

  v_settle := public.settle_store_sale_fee_obligations(v_req.store_id);

  SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_req.store_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'ledger_id', v_ledger,
    'balance_after_minor', coalesce(v_bal, 0),
    'amount_minor', v_req.amount_minor,
    'store_id', v_req.store_id,
    'obligation_settle', v_settle
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_business_cash_charge_request(p_admin_user_id uuid, p_request_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.business_cash_charge_requests;
BEGIN
  SELECT * INTO v_req FROM public.business_cash_charge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.status = 'REJECTED' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  IF v_req.status IS DISTINCT FROM 'PENDING' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;
  UPDATE public.business_cash_charge_requests
  SET status = 'REJECTED',
      admin_user_id = p_admin_user_id,
      decided_at = now(),
      reject_reason = nullif(trim(coalesce(p_reason, '')), ''),
      updated_at = now()
  WHERE id = v_req.id;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
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

  -- Lock order: cash account → obligation (same as charge / settle).
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

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'adjustment_id', v_adj, 'decision', p_decision,
    'approved_minor', v_approved, 'cash_refund_minor', v_refund, 'outstanding_cancel_minor', v_cancel,
    'cash_ledger_id', v_ledger
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.store_cash_position(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance bigint := 0;
  v_outstanding bigint := 0;
  v_mode text := public.store_cash_order_gate_mode();
  v_net bigint;
BEGIN
  SELECT coalesce(balance_minor, 0) INTO v_balance FROM public.business_cash_accounts WHERE store_id = p_store_id;
  SELECT coalesce(sum(fee_outstanding_minor), 0) INTO v_outstanding
    FROM public.store_sale_fee_obligations WHERE store_id = p_store_id AND status = 'open';
  v_net := coalesce(v_balance, 0) - coalesce(v_outstanding, 0);
  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'balance_minor', coalesce(v_balance, 0),
    'outstanding_minor', coalesce(v_outstanding, 0),
    'net_minor', v_net,
    'gate_mode', v_mode,
    'orderable', (v_mode = 'off' OR v_net > 0)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.store_commission_integrity_report(p_store_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ob AS (
    SELECT * FROM public.store_sale_fee_obligations
     WHERE p_store_ids IS NULL OR store_id = ANY (p_store_ids)
  ),
  i1 AS (  -- charged = remaining due + approved adjustments
    SELECT ob.id FROM ob LEFT JOIN public.store_commission_adjustments a ON a.obligation_id = ob.id
     WHERE ob.original_fee_due_minor IS NOT NULL
       AND ob.original_fee_due_minor <> ob.fee_due_minor + coalesce(a.approved_minor, 0)
  ),
  i2 AS (  -- Cash actually taken for the order = fee_paid_minor
    SELECT ob.id FROM ob
     WHERE ob.fee_paid_minor <> (
       coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE' AND l.related_type = 'store_order' AND l.related_id = ob.order_id::text), 0)
     + coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE_SETTLEMENT' AND l.related_id = ob.id::text), 0)
     - coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE_REVERSAL'
                    AND (l.related_id = ob.order_id::text
                         OR l.related_id IN (SELECT a.id::text FROM public.store_commission_adjustments a WHERE a.obligation_id = ob.id))), 0))
  ),
  i3 AS (  -- status matches amounts
    SELECT ob.id FROM ob
     WHERE (ob.status = 'open' AND ob.fee_outstanding_minor = 0)
        OR (ob.status = 'settled' AND ob.fee_outstanding_minor <> 0)
        OR (ob.status = 'waived' AND ob.fee_due_minor <> 0)
  ),
  i4 AS (  -- closed order with a live fee must be in review or decided
    SELECT ob.id FROM ob JOIN public.store_orders o ON o.id = ob.order_id
     WHERE o.order_status IN ('cancelled', 'refunded') AND ob.adjustment_status = 'none'
       AND ob.status <> 'waived' AND ob.fee_due_minor > 0
  ),
  acct AS (
    SELECT a.store_id, a.balance_minor,
           (SELECT coalesce(sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END), 0)
              FROM public.business_cash_ledger l WHERE l.store_id = a.store_id) AS ledger_sum
      FROM public.business_cash_accounts a
     WHERE p_store_ids IS NULL OR a.store_id = ANY (p_store_ids)
  ),
  i6 AS (SELECT store_id FROM acct WHERE balance_minor <> ledger_sum),
  i7 AS (SELECT id FROM ob WHERE original_fee_due_minor IS NULL)
  SELECT jsonb_build_object(
    'obligations', (SELECT count(*) FROM ob),
    'charged_eq_due_plus_adjustments', jsonb_build_object('violations', (SELECT count(*) FROM i1), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i1 LIMIT 50) x)),
    'cash_ledger_eq_fee_paid', jsonb_build_object('violations', (SELECT count(*) FROM i2), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i2 LIMIT 50) x)),
    'status_matches_amounts', jsonb_build_object('violations', (SELECT count(*) FROM i3), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i3 LIMIT 50) x)),
    'closed_orders_reviewed', jsonb_build_object('violations', (SELECT count(*) FROM i4), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i4 LIMIT 50) x)),
    'balance_eq_ledger_sum', jsonb_build_object('violations', (SELECT count(*) FROM i6), 'ids', (SELECT coalesce(jsonb_agg(store_id), '[]') FROM (SELECT store_id FROM i6 LIMIT 50) x)),
    'original_unknown', jsonb_build_object('count', (SELECT count(*) FROM i7), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i7 LIMIT 50) x))
  );
$function$;

CREATE OR REPLACE FUNCTION public.store_commission_enqueue_exception_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_review integer := 0;
  v_mismatch integer := 0;
  v_integrity integer := 0;
  v_payout integer := 0;
  v_report jsonb;
  v_check text;
  v_label text;
  r record;
BEGIN
  IF to_regclass('public.admin_notification_outbox') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'admin_notification_outbox_missing');
  END IF;

  -- 1) Open reviews whose alert never reached the outbox (e.g. enqueue failed in the trigger).
  FOR r IN
    SELECT ob.id FROM public.store_sale_fee_obligations ob
     WHERE ob.adjustment_status = 'review_required'
       AND NOT EXISTS (SELECT 1 FROM public.admin_notification_outbox x WHERE x.source_key = 'settlement_review:' || ob.id::text)
     ORDER BY ob.review_flagged_at NULLS LAST
     LIMIT 500
  LOOP
    IF public.store_commission_notify_review(r.id) THEN v_review := v_review + 1; END IF;
  END LOOP;

  -- 2) Cash balance ≠ ledger sum (keyed by store + current difference: a new difference = a new event).
  FOR r IN
    SELECT a.store_id, s.store_name, a.balance_minor,
           coalesce((SELECT sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END)
                       FROM public.business_cash_ledger l WHERE l.store_id = a.store_id), 0)::bigint AS ledger_sum
      FROM public.business_cash_accounts a
      JOIN public.stores s ON s.id = a.store_id
  LOOP
    CONTINUE WHEN r.balance_minor = r.ledger_sum;
    IF public.store_commission_notify_admin(
         'settlement_exception:balance_mismatch:' || r.store_id::text || ':' || (r.balance_minor - r.ledger_sum)::text,
         'settlement_financial_exception', 'critical',
         '[원장 불일치] ' || coalesce(r.store_name, r.store_id::text),
         '캐시 잔액 ' || public.store_commission_php_text(r.balance_minor) || ' ≠ 원장 합계 ' || public.store_commission_php_text(r.ledger_sum)
           || ' (차이 ' || public.store_commission_php_text(r.balance_minor - r.ledger_sum) || ') · 근거 확인 전 임의 정정 금지',
         '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id::text,
         'stores', r.store_id::text) THEN
      v_mismatch := v_mismatch + 1;
    END IF;
  END LOOP;

  -- 3) Obligation-level integrity violations (cash ledger ≠ fee paid = double charge / double refund suspect).
  v_report := public.store_commission_integrity_report(NULL);
  FOREACH v_check IN ARRAY ARRAY['charged_eq_due_plus_adjustments', 'cash_ledger_eq_fee_paid', 'status_matches_amounts', 'closed_orders_reviewed']
  LOOP
    v_label := CASE v_check
      WHEN 'cash_ledger_eq_fee_paid' THEN '이중 차감·환급 의심 (캐시 원장 ≠ 수수료 납부액)'
      WHEN 'charged_eq_due_plus_adjustments' THEN '부과액 ≠ 잔여 부과 + 승인 환급'
      WHEN 'status_matches_amounts' THEN '상태와 금액 불일치'
      ELSE '취소·환불 주문 수수료 검토 누락'
    END;
    FOR r IN
      SELECT ob.id, ob.store_id, o.order_no, st.store_name
        FROM jsonb_array_elements_text(coalesce(v_report -> v_check -> 'ids', '[]'::jsonb)) AS x(id)
        JOIN public.store_sale_fee_obligations ob ON ob.id = x.id::uuid
        JOIN public.store_orders o ON o.id = ob.order_id
        JOIN public.stores st ON st.id = ob.store_id
    LOOP
      IF public.store_commission_notify_admin(
           'settlement_exception:' || v_check || ':' || r.id::text,
           'settlement_financial_exception', 'critical',
           '[금융 예외] ' || coalesce(r.store_name, '') || ' · #' || coalesce(r.order_no, ''),
           v_label || ' · 근거 확인 전 임의 정정 금지',
           '/admin/store-settlements?tab=ledger&order_no=' || coalesce(r.order_no, '') || '&open=' || r.id::text,
           'store_sale_fee_obligations', r.id::text) THEN
        v_integrity := v_integrity + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- 4) Payout suspects: Coin above platform-held money (duplicate payout) / legacy manual payouts.
  FOR r IN
    SELECT x->>'order_id' AS order_id, x->>'order_no' AS order_no, x->>'store_id' AS store_id, x->>'store_name' AS store_name,
           (x->>'coin_over_credit')::bigint AS over, x->>'class' AS cls, (x->>'legacy_net_php')::bigint AS legacy_php
      FROM jsonb_array_elements(public.store_platform_payable_page(NULL, NULL, NULL, 'exceptions', 500, 0) -> 'rows') AS x
  LOOP
    IF r.over > 0 THEN
      IF public.store_commission_notify_admin(
           'settlement_exception:coin_over_credit:' || r.order_id,
           'settlement_financial_exception', 'critical',
           '[중복 지급 의심] ' || coalesce(r.store_name, '') || ' · #' || coalesce(r.order_no, ''),
           '플랫폼 보유분(상품권 레일 제외)보다 코인 ' || r.over::text || ' 초과 지급 · 근거 확인 전 회수 금지',
           '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id,
           'store_orders', r.order_id) THEN
        v_payout := v_payout + 1;
      END IF;
    END IF;
    IF r.cls = 'legacy_manual_paid' THEN
      IF public.store_commission_notify_admin(
           'settlement_exception:legacy_manual_paid:' || r.order_id,
           'settlement_financial_exception', 'warning',
           '[과거 수동 지급 확인] ' || coalesce(r.store_name, '') || ' · #' || coalesce(r.order_no, ''),
           '직접 결제 주문에 수동 지급 기록 ₱' || r.legacy_php::text || ' · 이중 지급 여부 확인 필요',
           '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id,
           'store_orders', r.order_id) THEN
        v_payout := v_payout + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'review_replayed', v_review, 'balance_mismatch', v_mismatch,
                            'integrity', v_integrity, 'payout_suspects', v_payout);
END;
$function$;
