-- Rollback for 20271107100000_apple_iap_topup + 20271107110000_point_apple_funds_digital_only.
--
-- 지우지 않는 것: apple_iap_transactions·apple_iap_notifications·apple_iap_sandbox_accounts(실제 결제·환불 증빙),
-- point_apple_fund_balances·point_apple_fund_events(출처 기록), point_ledger(잔액 원본). 테이블·행 삭제 없음.
-- 원장이 잔액 원본이므로 트리거를 떼어도 회원 잔액·Apple 지급분·환불 회수분은 그대로다.
--
-- 순서: ① 서버 환경변수 APPLE_IAP_BUNDLE_ID 제거(결제 화면·검증 닫힘) ② 이 파일 ③ 앱 코드 되돌림(선택).
-- 이 파일 이후에도 Apple 환불 알림 기록·관리자 환불 처리(회수/면제/재지급) 함수는 그대로 동작한다.
-- 다시 켤 때는 20271107110000_point_apple_funds_reenable.sql (같은 폴더) — 트리거만 다시 만들지 않는다.
SET lock_timeout = '5s';

BEGIN;

-- 1) 새 Apple 결제 준비 중단 — 상품만 비활성 (진행 중 거래의 검증·지급·환불 처리는 계속 가능)
UPDATE public.apple_iap_products SET is_active = false, updated_at = now() WHERE is_active;

-- 2) Point 출처 통제 해제 — 이후 원장 기록은 적용 전과 같다. 출처 기록은 동결·보존.
DROP TRIGGER IF EXISTS trg_point_ledger_apple_fund_guard ON public.point_ledger;

-- 3) Cash 충전 요청 함수 — 적용 전 운영 정의 그대로 (Apple Cash 예약 합산 2줄 제거)
CREATE OR REPLACE FUNCTION public.owner_create_business_cash_charge_request(p_owner_user_id uuid, p_store_id uuid, p_amount_minor bigint, p_payment_method text, p_payment_reference text, p_proof_file_path text, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_method text := lower(nullif(btrim(coalesce(p_payment_method, '')), ''));
  v_ref text := nullif(btrim(coalesce(p_payment_reference, '')), '');
  v_proof text := nullif(btrim(coalesce(p_proof_file_path, '')), '');
  v_policy jsonb;
  v_per_max bigint;
  v_month_max bigint;
  v_month_used bigint;
  v_month_start timestamptz;
  v_prev public.business_cash_charge_requests%ROWTYPE;
  v_id uuid;
  v_constraint text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_owner_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF v_key IS NULL OR char_length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_required');
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- One writer per store at a time: idempotent replay, PENDING-1 and reference checks see a stable state.
  PERFORM pg_advisory_xact_lock(hashtextextended('business_cash_charge_request:' || p_store_id::text, 0));

  SELECT * INTO v_prev FROM public.business_cash_charge_requests WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_prev.store_id IS DISTINCT FROM p_store_id OR v_prev.owner_user_id IS DISTINCT FROM p_owner_user_id
       OR v_prev.amount_minor IS DISTINCT FROM p_amount_minor THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_prev.id, 'status', v_prev.status);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.owner_user_id = p_owner_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_store_owner');
  END IF;

  v_policy := public.business_cash_charge_policy();
  IF v_method IS NULL OR NOT (v_policy -> 'payment_methods') ? v_method THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_method_required', 'payment_methods', v_policy -> 'payment_methods');
  END IF;
  IF v_ref IS NULL OR char_length(v_ref) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_reference_required');
  END IF;
  IF char_length(v_ref) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_reference_invalid');
  END IF;
  IF v_proof IS NOT NULL AND char_length(v_proof) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proof_file_path_invalid');
  END IF;

  v_per_max := nullif(v_policy ->> 'per_request_max_minor', '')::bigint;
  IF v_per_max IS NOT NULL AND p_amount_minor > v_per_max THEN
    RETURN jsonb_build_object('ok', false, 'error', 'amount_exceeds_request_cap', 'cap_minor', v_per_max);
  END IF;
  v_month_max := nullif(v_policy ->> 'monthly_max_minor', '')::bigint;
  IF v_month_max IS NOT NULL THEN
    -- Calendar month in Philippine time (display/business rule only; stored timestamps stay UTC).
    v_month_start := date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila';
    SELECT coalesce(sum(amount_minor), 0) INTO v_month_used
      FROM public.business_cash_charge_requests
     WHERE store_id = p_store_id AND status IN ('PENDING', 'APPROVED') AND created_at >= v_month_start;
    IF v_month_used + p_amount_minor > v_month_max THEN
      RETURN jsonb_build_object('ok', false, 'error', 'amount_exceeds_monthly_cap', 'cap_minor', v_month_max,
                                'used_minor', v_month_used);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.business_cash_charge_requests WHERE store_id = p_store_id AND status = 'PENDING') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'pending_request_exists');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.business_cash_charge_requests
     WHERE store_id = p_store_id AND status IN ('PENDING', 'APPROVED')
       AND payment_reference IS NOT NULL AND lower(btrim(payment_reference)) = lower(v_ref)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_reference_duplicate');
  END IF;

  BEGIN
    INSERT INTO public.business_cash_charge_requests (
      store_id, owner_user_id, amount_minor, status, idempotency_key,
      payment_method, payment_reference, proof_file_path
    ) VALUES (
      p_store_id, p_owner_user_id, p_amount_minor, 'PENDING', v_key,
      v_method, v_ref, v_proof
    ) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'business_cash_charge_requests_one_pending_per_store' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'pending_request_exists');
    ELSIF v_constraint = 'business_cash_charge_requests_store_reference_uidx' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'payment_reference_duplicate');
    ELSIF v_constraint = 'business_cash_charge_requests_idem_uidx' THEN
      SELECT * INTO v_prev FROM public.business_cash_charge_requests WHERE idempotency_key = v_key;
      IF FOUND AND v_prev.store_id = p_store_id AND v_prev.owner_user_id = p_owner_user_id
         AND v_prev.amount_minor = p_amount_minor THEN
        RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_prev.id, 'status', v_prev.status);
      END IF;
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'request_id', v_id, 'status', 'PENDING');
END;
$function$;

COMMIT;
