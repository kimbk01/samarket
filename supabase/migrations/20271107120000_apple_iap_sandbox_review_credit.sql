-- App Review 대응 (Owner 2026-11-07 「웹·DB 수정 시작」 · docs/audit/ios-appstore-defects-fixplan-2026-11-07.md D1)
--
-- 문제: Sandbox(심사·TestFlight) 결제는 apple_iap_sandbox_accounts 등록 계정 + 계정당 누적 11,000P 까지만 지급.
--       심사관이 새로 가입한 계정으로 사거나, 등록 계정이라도 상품 3종(1,000+5,250+11,000 = 17,250P)을 다 사면
--       결제는 됐는데 포인트가 지급되지 않고 「운영팀 확인 중」으로 멈춘다 → 2.1 / 3.1.1 반려 위험.
-- 변경: (1) apple_iap_credit 의 Sandbox 분기에서 등록 계정 제한만 제거 (나머지 본문은 20271107100000 정의와 동일)
--       (2) 계정당 누적 상한 11,000 → 34,500P (3종 × 2회)
-- 무변경: Production(실결제) 분기 · 서명 검증 · 번들/환경 검사(APPLE_IAP_ALLOW_SANDBOX) · 원장 표기(apple_iap_sandbox)
--         · apple_iap_sandbox_accounts 테이블·관리 RPC (기록용으로 남김)
-- 롤백: 20271107100000_apple_iap_topup.sql 의 apple_iap_credit · apple_iap_sandbox_point_cap 정의 재적용.

CREATE OR REPLACE FUNCTION public.apple_iap_sandbox_point_cap()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $fn$ SELECT 34500 $fn$;

CREATE OR REPLACE FUNCTION public.apple_iap_credit(
  p_attempt_id uuid,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_row public.apple_iap_transactions%ROWTYPE;
  v_req_id uuid;
  v_ledger uuid;
  v_cache integer;
  v_sum integer;
  v_balance integer;
  v_bal bigint;
  v_settle jsonb;
  v_actor text := CASE WHEN p_admin_user_id IS NULL THEN 'system' ELSE 'admin' END;
  v_sandbox boolean;
  v_key text;
  v_sandbox_used integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NOT NULL AND NOT internal.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_required');
  END IF;

  SELECT * INTO v_row FROM public.apple_iap_transactions WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  v_sandbox := v_row.environment = 'Sandbox';
  v_key := CASE WHEN v_sandbox THEN 'apple-sandbox:' ELSE 'apple:' END || coalesce(v_row.transaction_id, '');

  IF v_row.status = 'credited' THEN
    IF v_row.kind = 'point' THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'attempt_id', v_row.id, 'kind', 'point',
                                'ledger_id', v_row.credit_ledger_id, 'point_amount', v_row.point_amount,
                                'balance_after', public.sum_user_point_ledger(v_row.user_id));
    END IF;
    SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_row.store_id;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'attempt_id', v_row.id, 'kind', 'cash',
                              'ledger_id', v_row.credit_ledger_id, 'amount_minor', v_row.cash_amount_minor,
                              'balance_after_minor', coalesce(v_bal, 0));
  END IF;

  IF v_row.refund_status <> 'none' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'refund_pending', 'status', v_row.status);
  END IF;
  IF v_row.status = 'review' THEN
    IF p_admin_user_id IS NULL OR v_row.review_reason IS DISTINCT FROM 'attempt_reused' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'review_required', 'status', v_row.status,
                                'review_reason', v_row.review_reason);
    END IF;
  ELSIF v_row.status <> 'received' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_verified', 'status', v_row.status);
  END IF;
  IF p_admin_user_id IS NOT NULL AND (
       p_admin_user_id = v_row.user_id
       OR (v_row.store_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.stores s WHERE s.id = v_row.store_id AND s.owner_user_id = p_admin_user_id))
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_credit_forbidden');
  END IF;

  -- Cash IAP 출시 보류 — 지급하지 않는다 (상품 등록·결제 준비도 막혀 있어 정상 경로로는 여기에 오지 않는다)
  IF v_row.kind = 'cash' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cash_iap_disabled', 'status', v_row.status);
  END IF;

  -- Sandbox(심사·시험) 결제: 모든 회원 지급 · 계정별 누적 상한(apple_iap_sandbox_point_cap) 안에서만. 초과분은 검토로 두고 지급 없음.
  -- (2026-11-07 App Review 대응: 심사관은 새 Apple 가입 계정으로도 결제한다 — 등록 계정 제한 제거)
  -- 상한은 지급 완료된 Sandbox 거래 합계로 계산한다 (거래 기록은 삭제 불가 → 초기화로 우회 불가).
  IF v_sandbox THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('apple_iap_sandbox_cap:' || v_row.user_id::text, 0));
    SELECT coalesce(sum(t.point_amount), 0)::integer INTO v_sandbox_used
      FROM public.apple_iap_transactions t
     WHERE t.user_id = v_row.user_id AND t.environment = 'Sandbox' AND t.status = 'credited';
    IF v_sandbox_used + v_row.point_amount > public.apple_iap_sandbox_point_cap() THEN
      UPDATE public.apple_iap_transactions
         SET status = 'review', review_reason = 'sandbox_cap_exceeded', updated_at = now()
       WHERE id = v_row.id;
      RETURN jsonb_build_object('ok', false, 'error', 'sandbox_cap_exceeded', 'status', 'review',
                                'used_points', v_sandbox_used, 'cap_points', public.apple_iap_sandbox_point_cap());
    END IF;
  END IF;

  IF v_row.kind = 'point' THEN
    SELECT points INTO v_cache FROM public.profiles WHERE id = v_row.user_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
    END IF;
    v_sum := public.sum_user_point_ledger(v_row.user_id);
    IF coalesce(v_cache, 0) IS DISTINCT FROM v_sum THEN
      PERFORM public.project_user_point_balance_from_ledger(v_row.user_id);
      v_sum := public.sum_user_point_ledger(v_row.user_id);
    END IF;

    INSERT INTO public.point_charge_requests (
      user_id, plan_id, plan_name, payment_method, payment_amount, point_amount, applied_rate, rate_version,
      request_status, depositor_name, receipt_image_url, requested_at, updated_at,
      approved_at, approved_by, processed_at, processed_by, verified_at, verified_by, verification_note,
      idempotency_key
    ) VALUES (
      v_row.user_id, v_row.point_plan_id::text, v_row.plan_name,
      CASE WHEN v_sandbox THEN 'apple_iap_sandbox' ELSE 'apple_iap' END, v_row.payment_amount,
      v_row.point_amount, v_row.applied_rate, v_row.rate_version,
      'approved', '', '', v_row.created_at, now(),
      now(), p_admin_user_id, now(), p_admin_user_id, now(), p_admin_user_id,
      v_key,
      v_key
    ) RETURNING id INTO v_req_id;

    v_balance := v_sum + v_row.point_amount;
    INSERT INTO public.point_ledger (
      user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id,
      idempotency_key
    ) VALUES (
      v_row.user_id, 'charge', v_row.point_amount, v_balance, 'point_charge', v_req_id::text,
      CASE WHEN v_sandbox THEN 'Apple 테스트 결제 (Sandbox) 포인트 지급' ELSE 'Apple 결제 포인트 충전' END,
      v_actor, p_admin_user_id, v_key
    ) RETURNING id INTO v_ledger;

    v_balance := public.project_user_point_balance_from_ledger(v_row.user_id);

    UPDATE public.apple_iap_transactions
       SET status = 'credited', credited_at = now(), point_charge_request_id = v_req_id,
           credit_ledger_id = v_ledger, credited_by = p_admin_user_id, updated_at = now()
     WHERE id = v_row.id;

    RETURN jsonb_build_object('ok', true, 'idempotent', false, 'attempt_id', v_row.id, 'kind', 'point',
                              'ledger_id', v_ledger, 'request_id', v_req_id, 'point_amount', v_row.point_amount,
                              'balance_after', v_balance);
  END IF;

  -- Cash — 기존 승인(approve_business_cash_charge_request)과 같은 원장·잔액·수수료 정산 순서
  PERFORM public.ensure_business_cash_account(v_row.store_id);

  INSERT INTO public.business_cash_charge_requests (
    store_id, owner_user_id, amount_minor, status, idempotency_key, admin_user_id, decided_at,
    payment_method, payment_reference, decided_reason
  ) VALUES (
    v_row.store_id, v_row.user_id, v_row.cash_amount_minor, 'APPROVED', 'apple:' || v_row.transaction_id,
    p_admin_user_id, now(), 'apple_iap', 'apple:' || v_row.transaction_id, 'apple_iap_verified'
  ) RETURNING id INTO v_req_id;

  UPDATE public.business_cash_accounts
     SET balance_minor = balance_minor + v_row.cash_amount_minor, updated_at = now()
   WHERE store_id = v_row.store_id
   RETURNING balance_minor INTO v_bal;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_kind, direction, amount_minor, balance_after_minor,
    related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    v_row.store_id, 'TOP_UP', 'credit', v_row.cash_amount_minor, v_bal,
    'business_cash_charge_request', v_req_id::text, 'bc_topup:' || v_req_id::text, v_actor, p_admin_user_id,
    jsonb_build_object('payment_method', 'apple_iap', 'payment_reference', 'apple:' || v_row.transaction_id,
                       'apple_transaction_id', v_row.transaction_id, 'apple_attempt_id', v_row.id)
  ) RETURNING id INTO v_ledger;

  UPDATE public.business_cash_charge_requests
     SET credit_ledger_id = v_ledger, updated_at = now()
   WHERE id = v_req_id;

  UPDATE public.apple_iap_transactions
     SET status = 'credited', credited_at = now(), cash_charge_request_id = v_req_id,
         credit_ledger_id = v_ledger, credited_by = p_admin_user_id, updated_at = now()
   WHERE id = v_row.id;

  v_settle := public.settle_store_sale_fee_obligations(v_row.store_id);
  SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_row.store_id;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'attempt_id', v_row.id, 'kind', 'cash',
                            'ledger_id', v_ledger, 'request_id', v_req_id, 'amount_minor', v_row.cash_amount_minor,
                            'balance_after_minor', coalesce(v_bal, 0), 'obligation_settle', v_settle);
END;
$fn$;

REVOKE ALL ON FUNCTION public.apple_iap_credit(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_sandbox_point_cap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apple_iap_sandbox_point_cap() TO service_role;
GRANT EXECUTE ON FUNCTION public.apple_iap_credit(uuid, uuid) TO service_role;
