-- Apple IAP top-up — iOS 추가 입금 수단 (Owner 2026-11-05 승인: 코드 구현·격리 검증 범위, 운영 적용은 별도 승인)
--
-- 계약
--   - Apple IAP 는 새 화폐가 아니다. 기존 Point(point_charge_requests + point_ledger)·Cash(business_cash_charge_requests +
--     business_cash_ledger + business_cash_accounts) 충전의 결제 수단 하나(payment_method = 'apple_iap').
--   - Apple 결제 진행 상태(준비·승인 대기·확인 중·검토·환불)는 apple_iap_transactions 만 가진다.
--     기존 요청 표에는 서버 검증이 끝나 지급이 확정된 거래만 승인 완료(approved / APPROVED) 1행으로 생성한다.
--   - 요청 생성·원장 지급·Apple 거래 credited 전환 = apple_iap_credit 단일 트랜잭션.
--   - Apple 거래번호 전역 고유 (회원·매장 무관) + 기존 요청 중복 방지 키 'apple:<transaction_id>' + 기존 원장 1회 지급 제약.
--   - Apple 환불 = 관리자 검토만. 자동 차감·자동 음수·기존 원장 수정 없음. 회수는 관리자 결정으로 새 원장 1행(잔액 범위 안).
--   - Cash 한도는 운영 정책(business_cash_charge_policy) 그대로. Apple 결제 준비 시 예약으로 원자 집계, 지급 시 한도 재검사 없음.
--   - 기존 데이터 이관·잔액 직접 수정 없음. 기존 표·트리거·제약 변경 없음.
--   - 기존 함수 변경 1건: owner_create_business_cash_charge_request 의 월 한도 집계에 유효한 Apple 예약 합계를 더한다.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Apple 상품 대응표 (상품 등록·가격 확정은 Owner 승인 후 — 이 마이그레이션은 행을 넣지 않는다)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apple_iap_products (
  product_id text PRIMARY KEY CHECK (product_id ~ '^[A-Za-z0-9._-]{1,100}$'),
  kind text NOT NULL CHECK (kind IN ('point', 'cash')),
  point_plan_id uuid REFERENCES public.point_plans(id) ON DELETE RESTRICT,
  cash_amount_minor bigint CHECK (cash_amount_minor IS NULL OR cash_amount_minor > 0),
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT apple_iap_products_target_chk CHECK (
    (kind = 'point' AND point_plan_id IS NOT NULL AND cash_amount_minor IS NULL)
    OR (kind = 'cash' AND cash_amount_minor IS NOT NULL AND point_plan_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS apple_iap_products_point_plan_uidx
  ON public.apple_iap_products (point_plan_id) WHERE point_plan_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Apple 거래 기록 (id = StoreKit appAccountToken)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apple_iap_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('point', 'cash')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT,
  product_id text NOT NULL,
  client_key text NOT NULL CHECK (char_length(client_key) BETWEEN 8 AND 200),
  -- Point 스냅샷 (기존 충전 라우트와 같은 계산: point_amount + bonus_amount, payment_amount, rate)
  point_plan_id uuid,
  plan_name text,
  point_amount integer CHECK (point_amount IS NULL OR point_amount > 0),
  payment_amount integer CHECK (payment_amount IS NULL OR payment_amount > 0),
  applied_rate numeric,
  rate_version integer,
  -- Cash 스냅샷
  cash_amount_minor bigint CHECK (cash_amount_minor IS NULL OR cash_amount_minor > 0),
  status text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'deferred', 'user_cancelled', 'failed', 'received', 'credited', 'review')),
  reserve_expires_at timestamptz NOT NULL,
  -- Apple 서명 검증으로 확인한 거래 정보
  transaction_id text UNIQUE,
  original_transaction_id text,
  environment text CHECK (environment IS NULL OR environment IN ('Production', 'Sandbox')),
  bundle_id text,
  purchase_date timestamptz,
  price_milli bigint,
  currency text,
  storefront text,
  revoked_at timestamptz,
  signed_transaction text,
  verified_at timestamptz,
  verified_via text CHECK (verified_via IS NULL OR verified_via IN ('app', 'notification', 'admin')),
  credited_at timestamptz,
  point_charge_request_id uuid,
  cash_charge_request_id uuid,
  credit_ledger_id uuid,
  credited_by uuid,
  review_reason text,
  -- Apple 환불 (관리자 검토만)
  refund_status text NOT NULL DEFAULT 'none'
    CHECK (refund_status IN ('none', 'review', 'recovered', 'waived', 'reversed_review', 'reversed')),
  refund_notified_at timestamptz,
  refund_reason text,
  refund_decided_by uuid,
  refund_decided_at timestamptz,
  refund_decision_note text,
  refund_ledger_id uuid,
  refund_reversal_ledger_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT apple_iap_transactions_client_key_uq UNIQUE (user_id, client_key),
  CONSTRAINT apple_iap_transactions_kind_target_chk CHECK (
    (kind = 'point' AND store_id IS NULL AND point_plan_id IS NOT NULL AND point_amount IS NOT NULL
       AND payment_amount IS NOT NULL AND cash_amount_minor IS NULL)
    OR (kind = 'cash' AND store_id IS NOT NULL AND cash_amount_minor IS NOT NULL AND point_plan_id IS NULL)
  ),
  CONSTRAINT apple_iap_transactions_paid_has_txn_chk CHECK (
    status NOT IN ('received', 'credited') OR transaction_id IS NOT NULL
  ),
  CONSTRAINT apple_iap_transactions_credited_has_ledger_chk CHECK (
    status <> 'credited' OR (credit_ledger_id IS NOT NULL AND credited_at IS NOT NULL)
  ),
  CONSTRAINT apple_iap_transactions_refund_only_credited_chk CHECK (
    refund_status IN ('none', 'review', 'waived') OR status = 'credited'
  )
);

CREATE INDEX IF NOT EXISTS apple_iap_transactions_user_idx
  ON public.apple_iap_transactions (user_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS apple_iap_transactions_store_active_idx
  ON public.apple_iap_transactions (store_id, status, reserve_expires_at) WHERE kind = 'cash';
CREATE INDEX IF NOT EXISTS apple_iap_transactions_attention_idx
  ON public.apple_iap_transactions (status, refund_status, updated_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. App Store Server Notifications V2 수신 기록 (notificationUUID 중복 차단)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apple_iap_notifications (
  notification_uuid text PRIMARY KEY,
  notification_type text NOT NULL,
  subtype text,
  environment text,
  transaction_id text,
  signed_date timestamptz,
  result text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS apple_iap_notifications_txn_idx
  ON public.apple_iap_notifications (transaction_id, received_at DESC);
CREATE INDEX IF NOT EXISTS apple_iap_notifications_result_idx
  ON public.apple_iap_notifications (result, received_at DESC);

-- 서버(service_role) 전용 — 클라이언트 역할 직접 읽기·쓰기 차단
ALTER TABLE public.apple_iap_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_iap_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_iap_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_iap_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.apple_iap_transactions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.apple_iap_notifications FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_apple_iap_products_block_client_role_writes ON public.apple_iap_products;
CREATE TRIGGER trg_apple_iap_products_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.apple_iap_products
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();
DROP TRIGGER IF EXISTS trg_apple_iap_transactions_block_client_role_writes ON public.apple_iap_transactions;
CREATE TRIGGER trg_apple_iap_transactions_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.apple_iap_transactions
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();
DROP TRIGGER IF EXISTS trg_apple_iap_notifications_block_client_role_writes ON public.apple_iap_notifications;
CREATE TRIGGER trg_apple_iap_notifications_block_client_role_writes
  BEFORE INSERT OR UPDATE OR DELETE ON public.apple_iap_notifications
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

-- Apple 거래 기록은 삭제하지 않는다 (지급·환불 대사 근거)
CREATE OR REPLACE FUNCTION public.apple_iap_transactions_forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  RAISE EXCEPTION 'apple_iap_transactions_is_append_only';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_apple_iap_transactions_forbid_delete ON public.apple_iap_transactions;
CREATE TRIGGER trg_apple_iap_transactions_forbid_delete
  BEFORE DELETE ON public.apple_iap_transactions
  FOR EACH ROW EXECUTE FUNCTION public.apple_iap_transactions_forbid_delete();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Cash 예약 합계 (유효 예약 = 확인 중 거래 + 만료 전 준비·승인 대기)
--    월 경계: 유효 예약은 준비한 달과 무관하게 현재 달에 집계한다 (지급되면 그 시각의 APPROVED 로 집계되므로
--    현재 달을 적게 세지 않는다). credited 는 예약이 아니므로 APPROVED 와 중복 집계되지 않는다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apple_iap_cash_active_reserved_minor(p_store_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT coalesce(sum(t.cash_amount_minor), 0)::bigint
    FROM public.apple_iap_transactions t
   WHERE t.kind = 'cash'
     AND t.store_id = p_store_id
     AND (
       (t.status = 'received' AND t.refund_status = 'none')
       OR (t.status IN ('prepared', 'deferred') AND t.reserve_expires_at > now())
     );
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. 결제 준비 (지급 없음 · Cash 는 한도 예약)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apple_iap_prepare(
  p_user_id uuid,
  p_kind text,
  p_product_id text,
  p_store_id uuid,
  p_client_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_key text := nullif(btrim(coalesce(p_client_key, '')), '');
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_product public.apple_iap_products%ROWTYPE;
  v_plan record;
  v_prev public.apple_iap_transactions%ROWTYPE;
  v_pending public.apple_iap_transactions%ROWTYPE;
  v_policy jsonb;
  v_per_max bigint;
  v_month_max bigint;
  v_month_used bigint;
  v_reserved bigint;
  v_month_start timestamptz;
  v_points integer;
  v_pay integer;
  v_row public.apple_iap_transactions%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_user_id IS NULL OR v_kind NOT IN ('point', 'cash') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF v_key IS NULL OR char_length(v_key) < 8 OR char_length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_required');
  END IF;
  IF v_kind = 'cash' AND p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  IF v_kind = 'cash' THEN
    -- 수동 충전 신청(owner_create_business_cash_charge_request)과 같은 매장 단위 잠금 → 한도 집계가 원자적
    PERFORM pg_advisory_xact_lock(hashtextextended('business_cash_charge_request:' || p_store_id::text, 0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('apple_iap_point_prepare:' || p_user_id::text, 0));
  END IF;

  SELECT * INTO v_prev FROM public.apple_iap_transactions WHERE user_id = p_user_id AND client_key = v_key;
  IF FOUND THEN
    IF v_prev.kind IS DISTINCT FROM v_kind OR v_prev.product_id IS DISTINCT FROM p_product_id
       OR v_prev.store_id IS DISTINCT FROM p_store_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'attempt_id', v_prev.id, 'status', v_prev.status,
      'product_id', v_prev.product_id, 'reserve_expires_at', v_prev.reserve_expires_at
    );
  END IF;

  SELECT * INTO v_product FROM public.apple_iap_products WHERE product_id = p_product_id;
  IF NOT FOUND OR NOT v_product.is_active OR v_product.kind IS DISTINCT FROM v_kind THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_unavailable');
  END IF;

  -- 결제는 끝났지만 아직 지급 확인 중인 거래가 있으면 새 결제를 열지 않는다
  SELECT * INTO v_pending
    FROM public.apple_iap_transactions
   WHERE user_id = p_user_id AND kind = v_kind AND status = 'received' AND refund_status = 'none'
     AND (v_kind = 'point' OR store_id = p_store_id)
   ORDER BY created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'apple_credit_pending', 'attempt_id', v_pending.id);
  END IF;

  IF v_kind = 'point' THEN
    SELECT id, name_ko, name_en, point_amount, bonus_amount, payment_amount, rate_version, is_active
      INTO v_plan
      FROM public.point_plans
     WHERE id = v_product.point_plan_id;
    IF NOT FOUND OR NOT v_plan.is_active THEN
      RETURN jsonb_build_object('ok', false, 'error', 'product_unavailable');
    END IF;
    v_points := greatest(0, coalesce(v_plan.point_amount, 0)) + greatest(0, coalesce(v_plan.bonus_amount, 0));
    v_pay := greatest(0, coalesce(v_plan.payment_amount, 0));
    IF v_points <= 0 OR v_pay <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'product_unavailable');
    END IF;

    INSERT INTO public.apple_iap_transactions (
      kind, user_id, product_id, client_key, point_plan_id, plan_name, point_amount, payment_amount,
      applied_rate, rate_version, status, reserve_expires_at
    ) VALUES (
      'point', p_user_id, v_product.product_id, v_key, v_plan.id,
      coalesce(nullif(btrim(v_plan.name_ko), ''), nullif(btrim(v_plan.name_en), ''), v_points::text || 'P'),
      v_points, v_pay, v_points::numeric / v_pay::numeric, greatest(1, coalesce(v_plan.rate_version, 1)),
      'prepared', now() + interval '30 minutes'
    ) RETURNING * INTO v_row;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.owner_user_id = p_user_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'not_store_owner');
    END IF;

    v_policy := public.business_cash_charge_policy();
    v_per_max := nullif(v_policy ->> 'per_request_max_minor', '')::bigint;
    IF v_per_max IS NOT NULL AND v_product.cash_amount_minor > v_per_max THEN
      RETURN jsonb_build_object('ok', false, 'error', 'amount_exceeds_request_cap', 'cap_minor', v_per_max);
    END IF;
    v_month_max := nullif(v_policy ->> 'monthly_max_minor', '')::bigint;
    IF v_month_max IS NOT NULL THEN
      v_month_start := date_trunc('month', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila';
      SELECT coalesce(sum(amount_minor), 0) INTO v_month_used
        FROM public.business_cash_charge_requests
       WHERE store_id = p_store_id AND status IN ('PENDING', 'APPROVED') AND created_at >= v_month_start;
      v_reserved := public.apple_iap_cash_active_reserved_minor(p_store_id);
      IF v_month_used + v_reserved + v_product.cash_amount_minor > v_month_max THEN
        RETURN jsonb_build_object('ok', false, 'error', 'amount_exceeds_monthly_cap', 'cap_minor', v_month_max,
                                  'used_minor', v_month_used + v_reserved);
      END IF;
    END IF;

    INSERT INTO public.apple_iap_transactions (
      kind, user_id, store_id, product_id, client_key, cash_amount_minor, status, reserve_expires_at
    ) VALUES (
      'cash', p_user_id, p_store_id, v_product.product_id, v_key, v_product.cash_amount_minor,
      'prepared', now() + interval '30 minutes'
    ) RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'attempt_id', v_row.id, 'status', v_row.status,
    'product_id', v_row.product_id, 'reserve_expires_at', v_row.reserve_expires_at
  );
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. 앱이 받은 StoreKit 결과 (거래 없음: 취소·실패 / 보호자 승인 대기)
--    이미 received·credited·review 면 바꾸지 않는다 (늦게 온 결과가 성공을 덮지 않음).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apple_iap_mark_outcome(
  p_attempt_id uuid,
  p_user_id uuid,
  p_outcome text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_row public.apple_iap_transactions%ROWTYPE;
  v_outcome text := lower(btrim(coalesce(p_outcome, '')));
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_outcome NOT IN ('user_cancelled', 'failed', 'deferred') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_outcome');
  END IF;

  SELECT * INTO v_row FROM public.apple_iap_transactions WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND OR v_row.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row.status <> 'prepared' THEN
    RETURN jsonb_build_object('ok', true, 'changed', false, 'status', v_row.status);
  END IF;

  UPDATE public.apple_iap_transactions
     SET status = v_outcome,
         reserve_expires_at = CASE WHEN v_outcome = 'deferred' THEN now() + interval '7 days' ELSE now() END,
         updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'changed', true, 'status', v_outcome);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. 서버 검증을 통과한 Apple 거래 기록 (지급 아님 — 지급은 apple_iap_credit)
--    준비 기록이 취소·실패·만료여도 검증된 거래는 received 로 받는다 (돈을 받고 지급하지 않는 상황 방지).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apple_iap_record_verified_transaction(
  p_attempt_id uuid,
  p_transaction_id text,
  p_original_transaction_id text,
  p_product_id text,
  p_bundle_id text,
  p_environment text,
  p_purchase_date timestamptz,
  p_price_milli bigint,
  p_currency text,
  p_storefront text,
  p_revoked_at timestamptz,
  p_signed_transaction text,
  p_via text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_txn text := nullif(btrim(coalesce(p_transaction_id, '')), '');
  v_existing public.apple_iap_transactions%ROWTYPE;
  v_row public.apple_iap_transactions%ROWTYPE;
  v_new public.apple_iap_transactions%ROWTYPE;
  v_status text;
  v_reason text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF v_txn IS NULL OR p_via NOT IN ('app', 'notification', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_environment IS NOT NULL AND p_environment NOT IN ('Production', 'Sandbox') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_environment');
  END IF;

  -- 거래번호 단위 직렬화 (앱 검증·서버 알림이 동시에 와도 1행)
  PERFORM pg_advisory_xact_lock(hashtextextended('apple_iap_txn:' || v_txn, 0));

  SELECT * INTO v_existing FROM public.apple_iap_transactions WHERE transaction_id = v_txn;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'attempt_id', v_existing.id, 'status', v_existing.status);
  END IF;

  IF p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attempt_not_found');
  END IF;
  SELECT * INTO v_row FROM public.apple_iap_transactions WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'attempt_not_found');
  END IF;

  IF v_row.transaction_id IS NOT NULL THEN
    -- 같은 준비 기록에 다른 거래가 또 들어옴 → 돈은 받았으므로 버리지 않고 같은 스냅샷으로 검토 행을 만든다
    INSERT INTO public.apple_iap_transactions (
      kind, user_id, store_id, product_id, client_key, point_plan_id, plan_name, point_amount, payment_amount,
      applied_rate, rate_version, cash_amount_minor, status, reserve_expires_at,
      transaction_id, original_transaction_id, environment, bundle_id, purchase_date, price_milli, currency,
      storefront, revoked_at, signed_transaction, verified_at, verified_via, review_reason
    ) VALUES (
      v_row.kind, v_row.user_id, v_row.store_id, v_row.product_id, 'apple-reused:' || v_txn, v_row.point_plan_id,
      v_row.plan_name, v_row.point_amount, v_row.payment_amount, v_row.applied_rate, v_row.rate_version,
      v_row.cash_amount_minor, 'review', now(),
      v_txn, p_original_transaction_id, p_environment, p_bundle_id, p_purchase_date, p_price_milli, p_currency,
      p_storefront, p_revoked_at, p_signed_transaction, now(), p_via, 'attempt_reused'
    ) RETURNING * INTO v_new;
    RETURN jsonb_build_object('ok', true, 'duplicate', false, 'attempt_id', v_new.id, 'status', 'review',
                              'review_reason', 'attempt_reused');
  END IF;

  IF p_product_id IS DISTINCT FROM v_row.product_id THEN
    v_status := 'review';
    v_reason := 'product_mismatch';
  ELSIF p_revoked_at IS NOT NULL THEN
    v_status := 'review';
    v_reason := 'revoked';
  ELSE
    v_status := 'received';
    v_reason := NULL;
  END IF;

  UPDATE public.apple_iap_transactions
     SET status = v_status,
         review_reason = v_reason,
         transaction_id = v_txn,
         original_transaction_id = p_original_transaction_id,
         environment = p_environment,
         bundle_id = p_bundle_id,
         purchase_date = p_purchase_date,
         price_milli = p_price_milli,
         currency = p_currency,
         storefront = p_storefront,
         revoked_at = p_revoked_at,
         signed_transaction = p_signed_transaction,
         verified_at = now(),
         verified_via = p_via,
         updated_at = now()
   WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'attempt_id', v_row.id, 'status', v_status,
                            'review_reason', v_reason);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. 지급 — 요청 생성(승인 완료) + 원장 지급 + Apple 거래 credited 를 한 트랜잭션으로
--    p_admin_user_id: 관리자 재처리 (received 재시도, attempt_reused 검토 행 지급). 자동 경로는 NULL.
-- ─────────────────────────────────────────────────────────────────────────────
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
      v_row.user_id, v_row.point_plan_id::text, v_row.plan_name, 'apple_iap', v_row.payment_amount,
      v_row.point_amount, v_row.applied_rate, v_row.rate_version,
      'approved', '', '', v_row.created_at, now(),
      now(), p_admin_user_id, now(), p_admin_user_id, now(), p_admin_user_id,
      'apple:' || v_row.transaction_id,
      'apple:' || v_row.transaction_id
    ) RETURNING id INTO v_req_id;

    v_balance := v_sum + v_row.point_amount;
    INSERT INTO public.point_ledger (
      user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id,
      idempotency_key
    ) VALUES (
      v_row.user_id, 'charge', v_row.point_amount, v_balance, 'point_charge', v_req_id::text,
      'Apple 결제 포인트 충전', v_actor, p_admin_user_id, 'apple:' || v_row.transaction_id
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. 서버 알림 기록 (notificationUUID 1회)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apple_iap_log_notification(
  p_notification_uuid text,
  p_type text,
  p_subtype text,
  p_environment text,
  p_transaction_id text,
  p_signed_date timestamptz,
  p_result text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_inserted integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF nullif(btrim(coalesce(p_notification_uuid, '')), '') IS NULL OR nullif(btrim(coalesce(p_type, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  INSERT INTO public.apple_iap_notifications (
    notification_uuid, notification_type, subtype, environment, transaction_id, signed_date, result
  ) VALUES (
    p_notification_uuid, p_type, p_subtype, p_environment, p_transaction_id, p_signed_date, coalesce(p_result, 'logged')
  ) ON CONFLICT (notification_uuid) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'duplicate', v_inserted = 0);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Apple 환불 알림 → 관리자 검토 상태만 (잔액·원장 변경 없음)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apple_iap_record_refund_notification(
  p_notification_uuid text,
  p_type text,
  p_subtype text,
  p_environment text,
  p_transaction_id text,
  p_signed_date timestamptz,
  p_revocation_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_type text := upper(btrim(coalesce(p_type, '')));
  v_txn text := nullif(btrim(coalesce(p_transaction_id, '')), '');
  v_inserted integer;
  v_row public.apple_iap_transactions%ROWTYPE;
  v_next text;
  v_result text;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF nullif(btrim(coalesce(p_notification_uuid, '')), '') IS NULL
     OR v_type NOT IN ('REFUND', 'REFUND_REVERSED', 'REFUND_DECLINED') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  INSERT INTO public.apple_iap_notifications (
    notification_uuid, notification_type, subtype, environment, transaction_id, signed_date, result
  ) VALUES (
    p_notification_uuid, v_type, p_subtype, p_environment, v_txn, p_signed_date, 'processing'
  ) ON CONFLICT (notification_uuid) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true);
  END IF;

  IF v_txn IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('apple_iap_txn:' || v_txn, 0));
    SELECT * INTO v_row FROM public.apple_iap_transactions WHERE transaction_id = v_txn FOR UPDATE;
  END IF;
  IF v_txn IS NULL OR NOT FOUND THEN
    UPDATE public.apple_iap_notifications SET result = 'orphan_refund' WHERE notification_uuid = p_notification_uuid;
    RETURN jsonb_build_object('ok', true, 'duplicate', false, 'result', 'orphan_refund');
  END IF;

  v_next := v_row.refund_status;
  IF v_type = 'REFUND' THEN
    IF v_row.refund_status IN ('none', 'reversed') THEN
      v_next := 'review';
    END IF;
  ELSIF v_type = 'REFUND_REVERSED' THEN
    IF v_row.refund_status = 'recovered' THEN
      v_next := 'reversed_review';
    ELSIF v_row.refund_status IN ('review', 'waived') THEN
      v_next := 'reversed';
    END IF;
  END IF;

  -- 지급 전(received·review) 거래가 환불되면 검토 상태로 지급을 멈춘다 (apple_iap_credit 가 refund_pending 으로 거부)
  IF v_next IN ('reversed', 'reversed_review') AND v_row.status <> 'credited' THEN
    v_next := 'none';
  END IF;

  IF v_next IS DISTINCT FROM v_row.refund_status THEN
    UPDATE public.apple_iap_transactions
       SET refund_status = v_next,
           refund_notified_at = CASE WHEN v_type = 'REFUND' THEN now() ELSE refund_notified_at END,
           refund_reason = CASE WHEN v_type = 'REFUND' THEN p_revocation_reason ELSE refund_reason END,
           updated_at = now()
     WHERE id = v_row.id;
    v_result := 'refund_status:' || v_next;
  ELSE
    v_result := 'no_change';
  END IF;

  UPDATE public.apple_iap_notifications SET result = v_result WHERE notification_uuid = p_notification_uuid;
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'attempt_id', v_row.id, 'refund_status', v_next,
                            'result', v_result);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. 관리자 환불 결정 — recover(잔액 범위 안 회수) · waive(회수 안 함) · recredit(환불 취소 후 회수분 되돌림)
--     원장 새 행 1개만 · 거래번호 키로 1회 · 음수 금지 · 기존 행 수정 없음
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apple_iap_admin_decide_refund(
  p_attempt_id uuid,
  p_admin_user_id uuid,
  p_decision text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_row public.apple_iap_transactions%ROWTYPE;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_cache integer;
  v_sum integer;
  v_balance integer;
  v_bal bigint;
  v_ledger uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR NOT internal.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_required');
  END IF;
  IF v_decision NOT IN ('recover', 'waive', 'recredit') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_decision');
  END IF;
  IF v_note IS NULL OR char_length(v_note) < 2 OR char_length(v_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT * INTO v_row FROM public.apple_iap_transactions WHERE id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  -- 지급 전 환불된 거래는 회수할 것이 없다 → 회수 안 함(waive)으로만 닫는다
  IF v_row.status <> 'credited' AND v_decision <> 'waive' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_credited', 'status', v_row.status);
  END IF;
  IF p_admin_user_id = v_row.user_id
     OR (v_row.store_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.stores s WHERE s.id = v_row.store_id AND s.owner_user_id = p_admin_user_id)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_decision_forbidden');
  END IF;

  IF v_decision IN ('recover', 'waive') AND v_row.refund_status <> 'review' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'refund_not_in_review', 'refund_status', v_row.refund_status);
  END IF;
  IF v_decision = 'recredit' AND v_row.refund_status <> 'reversed_review' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'refund_not_reversed', 'refund_status', v_row.refund_status);
  END IF;

  IF v_decision = 'waive' THEN
    UPDATE public.apple_iap_transactions
       SET refund_status = 'waived', refund_decided_by = p_admin_user_id, refund_decided_at = now(),
           refund_decision_note = v_note, updated_at = now()
     WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', true, 'refund_status', 'waived');
  END IF;

  IF v_row.kind = 'point' THEN
    SELECT points INTO v_cache FROM public.profiles WHERE id = v_row.user_id FOR UPDATE;
    v_sum := public.sum_user_point_ledger(v_row.user_id);
    IF v_decision = 'recover' THEN
      IF v_sum < v_row.point_amount THEN
        RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_sum,
                                  'required', v_row.point_amount);
      END IF;
      INSERT INTO public.point_ledger (
        user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id,
        idempotency_key
      ) VALUES (
        v_row.user_id, 'admin_debit', -v_row.point_amount, v_sum - v_row.point_amount, 'apple_iap_refund',
        v_row.id::text, left('Apple 환불 회수 · ' || v_note, 500), 'admin', p_admin_user_id, v_row.transaction_id
      ) RETURNING id INTO v_ledger;
    ELSE
      INSERT INTO public.point_ledger (
        user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type, actor_id,
        idempotency_key
      ) VALUES (
        v_row.user_id, 'admin_credit', v_row.point_amount, v_sum + v_row.point_amount, 'apple_iap_refund_reversal',
        v_row.id::text, left('Apple 환불 취소 · 회수분 되돌림 · ' || v_note, 500), 'admin', p_admin_user_id,
        v_row.transaction_id
      ) RETURNING id INTO v_ledger;
    END IF;
    v_balance := public.project_user_point_balance_from_ledger(v_row.user_id);
  ELSE
    PERFORM public.ensure_business_cash_account(v_row.store_id);
    SELECT balance_minor INTO v_bal FROM public.business_cash_accounts WHERE store_id = v_row.store_id FOR UPDATE;
    IF v_decision = 'recover' THEN
      IF coalesce(v_bal, 0) < v_row.cash_amount_minor THEN
        RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance_minor', coalesce(v_bal, 0),
                                  'required_minor', v_row.cash_amount_minor);
      END IF;
      UPDATE public.business_cash_accounts
         SET balance_minor = balance_minor - v_row.cash_amount_minor, updated_at = now()
       WHERE store_id = v_row.store_id
       RETURNING balance_minor INTO v_bal;
      INSERT INTO public.business_cash_ledger (
        store_id, entry_kind, direction, amount_minor, balance_after_minor,
        related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
      ) VALUES (
        v_row.store_id, 'ADMIN_ADJUST', 'debit', v_row.cash_amount_minor, v_bal,
        'apple_iap_refund', v_row.id::text, 'apple_iap_refund:' || v_row.transaction_id, 'admin', p_admin_user_id,
        jsonb_build_object('apple_transaction_id', v_row.transaction_id, 'note', v_note)
      ) RETURNING id INTO v_ledger;
    ELSE
      UPDATE public.business_cash_accounts
         SET balance_minor = balance_minor + v_row.cash_amount_minor, updated_at = now()
       WHERE store_id = v_row.store_id
       RETURNING balance_minor INTO v_bal;
      INSERT INTO public.business_cash_ledger (
        store_id, entry_kind, direction, amount_minor, balance_after_minor,
        related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
      ) VALUES (
        v_row.store_id, 'ADMIN_ADJUST', 'credit', v_row.cash_amount_minor, v_bal,
        'apple_iap_refund_reversal', v_row.id::text, 'apple_iap_refund_reversal:' || v_row.transaction_id, 'admin',
        p_admin_user_id, jsonb_build_object('apple_transaction_id', v_row.transaction_id, 'note', v_note)
      ) RETURNING id INTO v_ledger;
    END IF;
  END IF;

  IF v_decision = 'recover' THEN
    UPDATE public.apple_iap_transactions
       SET refund_status = 'recovered', refund_decided_by = p_admin_user_id, refund_decided_at = now(),
           refund_decision_note = v_note, refund_ledger_id = v_ledger, updated_at = now()
     WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', true, 'refund_status', 'recovered', 'ledger_id', v_ledger);
  END IF;

  UPDATE public.apple_iap_transactions
     SET refund_status = 'reversed', refund_decided_by = p_admin_user_id, refund_decided_at = now(),
         refund_decision_note = v_note, refund_reversal_ledger_id = v_ledger, updated_at = now()
   WHERE id = v_row.id;
  RETURN jsonb_build_object('ok', true, 'refund_status', 'reversed', 'ledger_id', v_ledger);
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. 기존 Cash 수동 충전 신청 — 월 한도 집계에 유효한 Apple 예약 합계를 더한다 (그 외 동작 동일)
-- ─────────────────────────────────────────────────────────────────────────────
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
    -- Apple IAP: 진행 중 Apple 결제 예약도 같은 한도에 포함 (같은 매장 잠금 안에서 집계)
    v_month_used := v_month_used + public.apple_iap_cash_active_reserved_minor(p_store_id);
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

-- 권한: 서버(service_role) 전용
REVOKE ALL ON FUNCTION public.apple_iap_cash_active_reserved_minor(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_prepare(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_mark_outcome(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_record_verified_transaction(uuid, text, text, text, text, text, timestamptz, bigint, text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_credit(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_log_notification(text, text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_record_refund_notification(text, text, text, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_admin_decide_refund(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apple_iap_transactions_forbid_delete() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apple_iap_cash_active_reserved_minor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apple_iap_prepare(uuid, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apple_iap_mark_outcome(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apple_iap_record_verified_transaction(uuid, text, text, text, text, text, timestamptz, bigint, text, text, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apple_iap_credit(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apple_iap_log_notification(text, text, text, text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apple_iap_record_refund_notification(text, text, text, text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apple_iap_admin_decide_refund(uuid, uuid, text, text) TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.apple_iap_products TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.apple_iap_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.apple_iap_notifications TO service_role;
