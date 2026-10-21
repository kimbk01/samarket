-- 배달 오너 감사 2단계 2-A · FIN-04 ⊃ IA-22 (DB 부분) (문서 G-1 §5-A, Owner 승인 2026-10-21 · D-4 기본값)
-- Owner 원칙(고정): 입금 확인 없는 Cash 충전 금지 → 신규 충전 요청은 결제수단·입금 참조번호 필수.
-- D-4 세부(수취 계좌·상한·승인 등급)는 미결정 → 설정값(admin_settings key 'business_cash_charge_policy')으로 두고
--   기본 = 상한 없음 · 결제수단 bank_transfer/gcash/other · 수취 안내 없음. 결정 시 설정 행만 바꾼다(재배포 불요).
-- 운영 원문 기준(읽기 전용 pg_get_functiondef, 2026-10-21 PHT):
--   public.approve_business_cash_charge_request(uuid,uuid) base md5(prosrc) = 49aa771941ccc7e3ba56858ee52e6cf3
--   → 사유 인자 추가로 시그니처가 바뀌어 DROP 후 (uuid,uuid,text DEFAULT NULL) 로 재생성 (2 인자 호출 호환).
--   추가: internal.is_platform_admin(관리자) 재확인 · 자기 매장(stores.owner_user_id / 요청 owner) 승인 금지 ·
--         입금 참조번호 없는 요청 승인 거부 · 사유(2자 이상) 필수 → decided_reason 저장 · 원장 meta 에 결제수단·참조번호.
--   적립·상계(FIN-02 함수 호출)·멱등 재호출 응답 의미는 그대로.
-- 신규: public.business_cash_charge_policy() (설정 읽기) · public.owner_create_business_cash_charge_request(...)
--   (소유 확인 · 매장 PENDING 동시 1건 · 참조번호 매장 내 UNIQUE · 상한 · 멱등키) → TS INSERT 대체.
-- 컬럼 추가는 전부 NULL 허용 → 기존 27행(승인 20 · 반려 7) 무변 (D-5: 과거 승인 대사·회수 없음).
-- 운영 확인(2026-10-21): PENDING 0건 · 매장별 PENDING 중복 0건 → 부분 UNIQUE 인덱스 생성 가능.
-- 배포 순서: 이 파일 → 웹(main) → 20270603110400(N-4B: service_role 직접 쓰기 회수 + 신규 행 CHECK).
-- 함수 본문에는 비 ASCII 를 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백:
--   DROP FUNCTION IF EXISTS public.owner_create_business_cash_charge_request(uuid,uuid,bigint,text,text,text,text);
--   DROP FUNCTION IF EXISTS public.business_cash_charge_policy();
--   DROP FUNCTION IF EXISTS public.approve_business_cash_charge_request(uuid,uuid,text);
--   위 base md5 운영 원문으로 public.approve_business_cash_charge_request(uuid,uuid) 재생성 +
--     REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;
--   DROP INDEX IF EXISTS public.business_cash_charge_requests_one_pending_per_store;
--   DROP INDEX IF EXISTS public.business_cash_charge_requests_store_reference_uidx;
--   ALTER TABLE public.business_cash_charge_requests DROP CONSTRAINT IF EXISTS business_cash_charge_requests_payment_method_chk,
--     DROP COLUMN IF EXISTS payment_method, DROP COLUMN IF EXISTS payment_reference,
--     DROP COLUMN IF EXISTS proof_file_path, DROP COLUMN IF EXISTS decided_reason;

ALTER TABLE public.business_cash_charge_requests
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS proof_file_path text,
  ADD COLUMN IF NOT EXISTS decided_reason text;

COMMENT ON COLUMN public.business_cash_charge_requests.payment_method IS
  'FIN-04: owner-declared deposit method (policy list). NULL only on rows created before 20270603110100.';
COMMENT ON COLUMN public.business_cash_charge_requests.payment_reference IS
  'FIN-04: deposit reference (bank/GCash transaction no.), unique per store among PENDING/APPROVED. Required for new rows.';
COMMENT ON COLUMN public.business_cash_charge_requests.proof_file_path IS
  'FIN-04: optional deposit proof storage path.';
COMMENT ON COLUMN public.business_cash_charge_requests.decided_reason IS
  'FIN-04: admin approval reason (reject keeps reject_reason).';

ALTER TABLE public.business_cash_charge_requests
  DROP CONSTRAINT IF EXISTS business_cash_charge_requests_payment_method_chk;
ALTER TABLE public.business_cash_charge_requests
  ADD CONSTRAINT business_cash_charge_requests_payment_method_chk
  CHECK (payment_method IS NULL OR payment_method ~ '^[a-z][a-z0-9_]{1,31}$') NOT VALID;

-- Same deposit reference can back only one live (PENDING/APPROVED) request per store; a REJECTED one may be resubmitted.
CREATE UNIQUE INDEX IF NOT EXISTS business_cash_charge_requests_store_reference_uidx
  ON public.business_cash_charge_requests (store_id, lower(btrim(payment_reference)))
  WHERE payment_reference IS NOT NULL AND status IN ('PENDING', 'APPROVED');

-- At most one open request per store.
CREATE UNIQUE INDEX IF NOT EXISTS business_cash_charge_requests_one_pending_per_store
  ON public.business_cash_charge_requests (store_id)
  WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- D-4 settings (defaults until the Owner decides): admin_settings key 'business_cash_charge_policy'
--   { "per_request_max_minor": null|bigint, "monthly_max_minor": null|bigint,
--     "payment_methods": ["bank_transfer","gcash","other"], "receiving_account_note": null|text }
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.business_cash_charge_policy()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH s AS (
    SELECT coalesce((SELECT value_json FROM public.admin_settings WHERE key = 'business_cash_charge_policy'), '{}'::jsonb) AS v
  )
  SELECT jsonb_build_object(
    'per_request_max_minor',
      CASE WHEN jsonb_typeof(s.v -> 'per_request_max_minor') = 'number' AND (s.v ->> 'per_request_max_minor')::numeric > 0
           THEN to_jsonb(trunc((s.v ->> 'per_request_max_minor')::numeric)::bigint) ELSE 'null'::jsonb END,
    'monthly_max_minor',
      CASE WHEN jsonb_typeof(s.v -> 'monthly_max_minor') = 'number' AND (s.v ->> 'monthly_max_minor')::numeric > 0
           THEN to_jsonb(trunc((s.v ->> 'monthly_max_minor')::numeric)::bigint) ELSE 'null'::jsonb END,
    'payment_methods',
      CASE WHEN jsonb_typeof(s.v -> 'payment_methods') = 'array' AND jsonb_array_length(s.v -> 'payment_methods') > 0
           THEN s.v -> 'payment_methods' ELSE '["bank_transfer", "gcash", "other"]'::jsonb END,
    'receiving_account_note',
      CASE WHEN jsonb_typeof(s.v -> 'receiving_account_note') = 'string' AND btrim(s.v ->> 'receiving_account_note') <> ''
           THEN to_jsonb(btrim(s.v ->> 'receiving_account_note')) ELSE 'null'::jsonb END,
    'payment_reference_required', true
  )
  FROM s;
$fn$;

REVOKE ALL ON FUNCTION public.business_cash_charge_policy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_cash_charge_policy() TO service_role;

-- ---------------------------------------------------------------------------
-- Owner top-up request (replaces the service_role TS INSERT).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_create_business_cash_charge_request(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_amount_minor bigint,
  p_payment_method text,
  p_payment_reference text,
  p_proof_file_path text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
$fn$;

REVOKE ALL ON FUNCTION public.owner_create_business_cash_charge_request(uuid,uuid,bigint,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.owner_create_business_cash_charge_request(uuid,uuid,bigint,text,text,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Approval: base = live prod body (md5 49aa771941ccc7e3ba56858ee52e6cf3) + admin / self-store / reference / reason guards.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.approve_business_cash_charge_request(uuid, uuid);

CREATE OR REPLACE FUNCTION public.approve_business_cash_charge_request(p_admin_user_id uuid, p_request_id uuid, p_reason text DEFAULT NULL::text)
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
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR NOT internal.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_required');
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
  -- FIN-04: an admin never credits Cash to a store they own (or a request they filed).
  IF v_req.owner_user_id = p_admin_user_id
     OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = v_req.store_id AND s.owner_user_id = p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_store_approval_forbidden');
  END IF;
  -- FIN-04: no Cash without a deposit reference to reconcile against.
  IF v_req.payment_reference IS NULL OR btrim(v_req.payment_reference) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payment_reference_missing');
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  PERFORM public.ensure_business_cash_account(v_req.store_id);

  UPDATE public.business_cash_accounts
  SET balance_minor = balance_minor + v_req.amount_minor, updated_at = now()
  WHERE store_id = v_req.store_id
  RETURNING balance_minor INTO v_bal;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_kind, direction, amount_minor, balance_after_minor,
    related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    v_req.store_id, 'TOP_UP', 'credit', v_req.amount_minor, v_bal,
    'business_cash_charge_request', v_req.id::text,
    'bc_topup:' || v_req.id::text, 'admin', p_admin_user_id,
    jsonb_build_object('payment_method', v_req.payment_method, 'payment_reference', v_req.payment_reference)
  ) RETURNING id INTO v_ledger;

  UPDATE public.business_cash_charge_requests
  SET status = 'APPROVED',
      admin_user_id = p_admin_user_id,
      decided_at = now(),
      credit_ledger_id = v_ledger,
      decided_reason = v_reason,
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

REVOKE ALL ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_business_cash_charge_request(uuid, uuid, text) TO service_role;
