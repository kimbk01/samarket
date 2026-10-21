-- 배달 오너 감사 2단계 2-A · FIN-08 (문서 G-1 §5-A, Owner 승인 2026-10-21 · D-5)
-- 원인: business_cash_ledger / store_economic_point_ledger 의 entry_kind CHECK 에 ADMIN_ADJUST 가 있으나 작성 함수·API 없음
--   → 앞으로 생길 불일치를 증거 기반으로 정정할 수단이 없다. 무결성 보고의 기존 위반(캐시 잔액 ≠ 원장 합계 1매장 ₱225,
--   Coin 초과 지급)이 예외 알림 대상에 영구히 남는다.
-- D-5: 과거 데이터(₱225 · Coin 초과 등)는 정리·정정·회수하지 않는다. 이 파일은 데이터를 바꾸지 않는다.
-- 수정(코드 결함만):
--   1) public.admin_adjust_business_cash(...) · public.admin_adjust_store_coin(...) — super_admin 재확인, 사유·증거 필수,
--      원장 ADMIN_ADJUST 1행 + audit_logs 1행(같은 트랜잭션), 음수 잔액 거부, 멱등 키, 정정 원장 전용(잔액 이동 0) 모드.
--   2) R-D5 분류용 보조 함수(기준 시각 2026-10-20 20:30 UTC = P0-5 c_charge_from) — 무결성 보고·예외 알림 재정의는
--      2-B(20270603120200, store_commission_integrity_report 재정의) 이후에 적용되도록
--      20270603125000_stage2a_fin08_integrity_d5_legacy.sql 에 둔다.
-- 신규 함수만 정의 (기존 함수 재정의 없음).
-- 함수 본문에는 비 ASCII 를 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_adjust_business_cash(uuid,uuid,text,bigint,text,text,text,boolean);
--   DROP FUNCTION IF EXISTS public.admin_adjust_store_coin(uuid,uuid,text,integer,text,text,text,boolean);
--   (20270603125000 을 먼저 롤백한 뒤)
--   DROP FUNCTION IF EXISTS public.store_commission_cash_account_is_d5_legacy(uuid,timestamptz);
--   DROP FUNCTION IF EXISTS public.store_commission_d5_legacy_cutoff();
--   DROP FUNCTION IF EXISTS internal.is_platform_super_admin(uuid);
--   (작성된 ADMIN_ADJUST 원장·감사 행은 불변 원장이므로 롤백 대상이 아니다.)

CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.is_platform_super_admin(check_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT check_uid IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.admin_memberships m
      WHERE m.user_id = check_uid
        AND m.status = 'active'
        AND m.role = 'super_admin'
    );
$fn$;

REVOKE ALL ON FUNCTION internal.is_platform_super_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.is_platform_super_admin(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.store_commission_d5_legacy_cutoff()
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT '2026-10-20 20:30:00+00'::timestamptz;
$fn$;

REVOKE ALL ON FUNCTION public.store_commission_d5_legacy_cutoff() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_commission_d5_legacy_cutoff() TO service_role;

-- A Cash account whose balance and ledger have not moved since the cutoff carries only pre-cutoff state.
CREATE OR REPLACE FUNCTION public.store_commission_cash_account_is_d5_legacy(p_store_id uuid, p_account_updated_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p_account_updated_at < public.store_commission_d5_legacy_cutoff()
    AND NOT EXISTS (
      SELECT 1 FROM public.business_cash_ledger l
       WHERE l.store_id = p_store_id AND l.created_at >= public.store_commission_d5_legacy_cutoff()
    );
$fn$;

REVOKE ALL ON FUNCTION public.store_commission_cash_account_is_d5_legacy(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_commission_cash_account_is_d5_legacy(uuid, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 1) Admin correction RPCs (super_admin only, reason + evidence, ledger + audit, no negative balance).
--    p_direction: 'credit' | 'debit'. p_ledger_only = true records the correction row without moving the balance
--    (used when the balance is right and the ledger is missing / has an extra row).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_adjust_business_cash(
  p_admin_user_id uuid,
  p_store_id uuid,
  p_direction text,
  p_amount_minor bigint,
  p_reason text,
  p_evidence_ref text,
  p_idempotency_key text,
  p_ledger_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_evidence text := nullif(btrim(coalesce(p_evidence_ref, '')), '');
  v_dir text := lower(btrim(coalesce(p_direction, '')));
  v_ledger_only boolean := coalesce(p_ledger_only, false);
  v_prev public.business_cash_ledger%ROWTYPE;
  v_before bigint;
  v_after bigint;
  v_ledger uuid;
  v_adj uuid := gen_random_uuid();
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT internal.is_platform_super_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'super_admin_required');
  END IF;
  IF p_store_id IS NULL OR v_key IS NULL OR v_dir NOT IN ('credit', 'debit') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF v_evidence IS NULL OR char_length(v_evidence) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'evidence_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  PERFORM public.ensure_business_cash_account(p_store_id);
  SELECT balance_minor INTO v_before FROM public.business_cash_accounts WHERE store_id = p_store_id FOR UPDATE;

  SELECT * INTO v_prev FROM public.business_cash_ledger WHERE idempotency_key = 'admin_adjust_cash:' || v_key;
  IF FOUND THEN
    IF v_prev.store_id IS DISTINCT FROM p_store_id OR v_prev.amount_minor IS DISTINCT FROM p_amount_minor
       OR v_prev.direction IS DISTINCT FROM v_dir THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_prev.id,
                              'balance_after_minor', v_before);
  END IF;

  IF v_ledger_only THEN
    v_after := v_before;
  ELSIF v_dir = 'credit' THEN
    v_after := v_before + p_amount_minor;
  ELSE
    v_after := v_before - p_amount_minor;
  END IF;
  IF v_after < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance_minor', v_before);
  END IF;

  IF NOT v_ledger_only THEN
    UPDATE public.business_cash_accounts
       SET balance_minor = v_after, updated_at = now()
     WHERE store_id = p_store_id;
  END IF;

  INSERT INTO public.business_cash_ledger (
    store_id, entry_kind, direction, amount_minor, balance_after_minor,
    related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    p_store_id, 'ADMIN_ADJUST', v_dir, p_amount_minor, v_after,
    'admin_adjustment', v_adj::text, 'admin_adjust_cash:' || v_key, 'admin', p_admin_user_id,
    jsonb_build_object('reason', v_reason, 'evidence_ref', v_evidence, 'ledger_only', v_ledger_only,
                       'balance_before_minor', v_before)
  ) RETURNING id INTO v_ledger;

  INSERT INTO public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  VALUES (
    'admin', p_admin_user_id, 'business_cash_account', p_store_id::text, 'business_cash.admin_adjust',
    jsonb_build_object('balance_minor', v_before),
    jsonb_build_object('balance_minor', v_after, 'ledger_id', v_ledger, 'direction', v_dir,
                       'amount_minor', p_amount_minor, 'ledger_only', v_ledger_only,
                       'reason', v_reason, 'evidence_ref', v_evidence, 'adjustment_id', v_adj)
  );

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'ledger_id', v_ledger, 'adjustment_id', v_adj,
                            'balance_before_minor', v_before, 'balance_after_minor', v_after,
                            'ledger_only', v_ledger_only);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_adjust_business_cash(uuid,uuid,text,bigint,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_business_cash(uuid,uuid,text,bigint,text,text,text,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_adjust_store_coin(
  p_admin_user_id uuid,
  p_store_id uuid,
  p_direction text,
  p_amount integer,
  p_reason text,
  p_evidence_ref text,
  p_idempotency_key text,
  p_ledger_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_evidence text := nullif(btrim(coalesce(p_evidence_ref, '')), '');
  v_dir text := lower(btrim(coalesce(p_direction, '')));
  v_ledger_only boolean := coalesce(p_ledger_only, false);
  v_prev public.store_economic_point_ledger%ROWTYPE;
  v_signed integer;
  v_before integer;
  v_after integer;
  v_ledger uuid;
  v_adj uuid := gen_random_uuid();
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT internal.is_platform_super_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'super_admin_required');
  END IF;
  IF p_store_id IS NULL OR v_key IS NULL OR v_dir NOT IN ('credit', 'debit') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF v_evidence IS NULL OR char_length(v_evidence) < 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'evidence_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = p_store_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  v_signed := CASE WHEN v_dir = 'credit' THEN p_amount ELSE -p_amount END;

  PERFORM public.ensure_store_economic_point_account(p_store_id);
  SELECT balance INTO v_before FROM public.store_economic_point_accounts WHERE store_id = p_store_id FOR UPDATE;

  SELECT * INTO v_prev FROM public.store_economic_point_ledger WHERE idempotency_key = 'admin_adjust_coin:' || v_key;
  IF FOUND THEN
    IF v_prev.store_id IS DISTINCT FROM p_store_id OR v_prev.amount IS DISTINCT FROM v_signed THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_prev.id, 'balance_after', v_before);
  END IF;

  v_after := CASE WHEN v_ledger_only THEN v_before ELSE v_before + v_signed END;
  IF v_after < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_before);
  END IF;

  IF NOT v_ledger_only THEN
    UPDATE public.store_economic_point_accounts
       SET balance = v_after, updated_at = now()
     WHERE store_id = p_store_id;
  END IF;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after,
    related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    p_store_id, 'ADMIN_ADJUST', v_signed, v_after,
    'admin_adjustment', v_adj::text, 'admin_adjust_coin:' || v_key, 'admin', p_admin_user_id,
    jsonb_build_object('reason', v_reason, 'evidence_ref', v_evidence, 'ledger_only', v_ledger_only,
                       'balance_before', v_before)
  ) RETURNING id INTO v_ledger;

  INSERT INTO public.audit_logs (actor_type, actor_id, target_type, target_id, action, before_json, after_json)
  VALUES (
    'admin', p_admin_user_id, 'store_coin_account', p_store_id::text, 'store_coin.admin_adjust',
    jsonb_build_object('balance', v_before),
    jsonb_build_object('balance', v_after, 'ledger_id', v_ledger, 'direction', v_dir,
                       'amount', p_amount, 'ledger_only', v_ledger_only,
                       'reason', v_reason, 'evidence_ref', v_evidence, 'adjustment_id', v_adj)
  );

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'ledger_id', v_ledger, 'adjustment_id', v_adj,
                            'balance_before', v_before, 'balance_after', v_after, 'ledger_only', v_ledger_only);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_adjust_store_coin(uuid,uuid,text,integer,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_store_coin(uuid,uuid,text,integer,text,text,text,boolean) TO service_role;
