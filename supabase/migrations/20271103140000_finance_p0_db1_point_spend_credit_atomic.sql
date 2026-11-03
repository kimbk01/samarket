-- 금융 P0 DB-1 (Owner 2026-11-03 승인: 구현·비운영 검증까지. 운영 DB 적용은 별도 승인)
-- 회원 POINT 차감·지급을 한 트랜잭션 RPC 로.
--   회원 행 잠금(profiles FOR UPDATE) → 같은 출처 중복 확인 → 원장 합계 → 부족 거절 → 원장 INSERT → 잔액 재투영.
--   기존 TS spendUserPoints / creditUserPoints 의 「SELECT 후 INSERT」(잠금·트랜잭션 없음) 경로를 대체한다.
-- 기존 원장 행·기존 함수는 바꾸지 않는다 (추가만).
--
-- 중복 의미는 기존 TS 와 같다:
--   차감 — 같은 회원·related_type·related_id 원장이 이미 있으면 다시 차감하지 않고 duplicate 로 돌려준다.
--   지급 — 같은 회원·entry_type·related_type·related_id 원장이 있으면 duplicate.
-- entry_type 은 TS 호출처가 쓰는 종류만 허용한다 (이 RPC 로 보상·관리자 조정·충전을 우회 기록하지 못하게).
--
-- 운영 데이터 확인 (2026-11-03 읽기 전용): ad_hold 67행·ad_purchase(음수) 1행·ad_charge 0행 모두
-- (user_id, related_type, related_id, entry_type) 중복 0 → 아래 고유 인덱스 생성 충돌 없음.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS point_ledger_debit_once_uidx
  ON public.point_ledger (user_id, related_type, related_id, entry_type)
  WHERE entry_type IN ('ad_hold', 'ad_purchase', 'ad_charge') AND amount < 0;

CREATE OR REPLACE FUNCTION public.spend_user_points(
  p_user_id uuid,
  p_amount integer,
  p_entry_type text,
  p_related_type text,
  p_related_id text,
  p_description text,
  p_actor_type text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_related_id text := btrim(coalesce(p_related_id, ''));
  v_related_type text := btrim(coalesce(p_related_type, ''));
  v_existing uuid;
  v_sum integer;
  v_after integer;
  v_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount < 1
     OR v_related_id = '' OR v_related_type = ''
     OR coalesce(btrim(p_actor_type), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_entry_type IS NULL OR p_entry_type NOT IN ('ad_hold', 'ad_purchase', 'ad_charge') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_entry_type');
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT id INTO v_existing
    FROM public.point_ledger
   WHERE user_id = p_user_id AND related_type = v_related_type AND related_id = v_related_id
   ORDER BY created_at ASC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'ledger_id', v_existing,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id));
  END IF;

  v_sum := public.sum_user_point_ledger(p_user_id);
  IF v_sum < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'balance', v_sum);
  END IF;
  v_after := v_sum - p_amount;

  BEGIN
    INSERT INTO public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type)
    VALUES
      (p_user_id, p_entry_type, -p_amount, v_after, v_related_type, v_related_id,
       left(coalesce(p_description, ''), 500), p_actor_type)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id));
  END;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'ledger_id', v_id,
    'balance_before', v_sum,
    'balance_after', public.project_user_point_balance_from_ledger(p_user_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_user_points(
  p_user_id uuid,
  p_amount integer,
  p_entry_type text,
  p_related_type text,
  p_related_id text,
  p_description text,
  p_actor_type text,
  p_earned_at timestamptz DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_related_id text := btrim(coalesce(p_related_id, ''));
  v_related_type text := btrim(coalesce(p_related_type, ''));
  v_existing uuid;
  v_sum integer;
  v_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount < 1
     OR v_related_id = '' OR v_related_type = ''
     OR coalesce(btrim(p_actor_type), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF p_entry_type IS NULL OR p_entry_type NOT IN ('ad_hold_release', 'ad_refund') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_entry_type');
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  SELECT id INTO v_existing
    FROM public.point_ledger
   WHERE user_id = p_user_id AND entry_type = p_entry_type
     AND related_type = v_related_type AND related_id = v_related_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'ledger_id', v_existing,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id));
  END IF;

  v_sum := public.sum_user_point_ledger(p_user_id);

  BEGIN
    INSERT INTO public.point_ledger
      (user_id, entry_type, amount, balance_after, related_type, related_id, description, actor_type,
       earned_at, expires_at)
    VALUES
      (p_user_id, p_entry_type, p_amount, v_sum + p_amount, v_related_type, v_related_id,
       left(coalesce(p_description, ''), 500), p_actor_type,
       p_earned_at, p_expires_at)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true,
      'balance_after', public.project_user_point_balance_from_ledger(p_user_id));
  END;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'ledger_id', v_id,
    'balance_before', v_sum,
    'balance_after', public.project_user_point_balance_from_ledger(p_user_id));
END;
$$;

REVOKE ALL ON FUNCTION public.spend_user_points(uuid, integer, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_user_points(uuid, integer, text, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.credit_user_points(uuid, integer, text, text, text, text, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_user_points(uuid, integer, text, text, text, text, text, timestamptz, timestamptz) TO service_role;

COMMENT ON FUNCTION public.spend_user_points IS
  'P0 DB-1: member Point debit — profile lock, source dedupe, balance check, ledger + projection in one TX.';
COMMENT ON FUNCTION public.credit_user_points IS
  'P0 DB-1: member Point refund/release credit — profile lock, source dedupe, ledger + projection in one TX.';

COMMIT;
