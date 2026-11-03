-- 금융 P0 DB-2 (Owner 2026-11-03 승인: 구현·비운영 검증까지. 운영 DB 적용은 별도 승인)
-- Coin → Cash 전환 읽기 전용 미리보기.
--   convert_store_economic_points_to_business_cash 와 같은 정책 행·같은 검사 순서·같은 식으로
--   막히는 사유(blockers)와 전후 Coin·Cash, 미납 수수료 정산 예상액, 실제 Cash 증가액을 서버에서 계산한다.
--   쓰기·잠금 없음. 미리보기 성공은 실행 보증이 아니다 — 실제 전환은 기존 전환 RPC 가 트랜잭션 안에서
--   최신 잔액·정책을 다시 검사한다 (이 파일은 전환 RPC 를 바꾸지 않는다).
--
-- 검사 순서 (전환 RPC 와 동일):
--   conversion_disabled → below_minimum → invalid_unit → daily_count_limit → weekly_count_limit
--   → monthly_count_limit → daily_coin_limit → monthly_coin_limit → interval_limit
--   → insufficient_store_points → credit_zero
-- 요청 Coin 이 0 이하이면 'amount_required' (정책·한도·잔액 표시용 조회).
-- 수수료 정산 예상: settle_store_sale_fee_obligations 와 같은 규칙 — 전환 후 Cash 가 0 보다 크면
--   open 미납 합계와 전환 후 Cash 중 작은 값만큼 정산.

BEGIN;

CREATE OR REPLACE FUNCTION public.preview_store_coin_conversion(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_points integer
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_policy public.business_cash_conversion_rate_policies;
  v_points integer := coalesce(p_points, 0);
  v_min integer;
  v_unit integer;
  v_coin bigint;
  v_cash bigint;
  v_outstanding bigint;
  v_day_count integer;
  v_day_coin integer;
  v_week_count integer;
  v_month_count integer;
  v_month_coin integer;
  v_last_at timestamptz;
  v_blockers text[] := ARRAY[]::text[];
  v_count_blocked boolean := false;
  v_credit bigint := 0;
  v_cash_pre_settle bigint;
  v_settle bigint := 0;
  v_max bigint;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_owner_user_id IS NULL OR p_store_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT owner_user_id INTO v_owner FROM public.stores WHERE id = p_store_id;
  IF NOT FOUND OR v_owner IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_policy FROM public.business_cash_conversion_rate_policies WHERE id = 'default';
  IF NOT FOUND OR v_policy.rate_pesos_per_point IS NULL OR v_policy.rate_pesos_per_point <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_missing');
  END IF;
  v_min := COALESCE(v_policy.minimum_coin_per_conversion, 1);
  v_unit := COALESCE(v_policy.conversion_unit, 1);

  SELECT balance INTO v_coin FROM public.store_economic_point_accounts WHERE store_id = p_store_id;
  v_coin := coalesce(v_coin, 0);
  SELECT balance_minor INTO v_cash FROM public.business_cash_accounts WHERE store_id = p_store_id;
  v_cash := coalesce(v_cash, 0);
  SELECT coalesce(sum(fee_outstanding_minor), 0) INTO v_outstanding
    FROM public.store_sale_fee_obligations
   WHERE store_id = p_store_id AND status = 'open' AND fee_outstanding_minor > 0;

  SELECT count(*)::integer, COALESCE(sum(abs(amount)), 0)::integer
    INTO v_day_count, v_day_coin
    FROM public.store_economic_point_ledger
   WHERE store_id = p_store_id AND entry_kind = 'CONVERT_TO_BUSINESS_CASH'
     AND created_at >= date_trunc('day', now());
  SELECT count(*)::integer INTO v_week_count
    FROM public.store_economic_point_ledger
   WHERE store_id = p_store_id AND entry_kind = 'CONVERT_TO_BUSINESS_CASH'
     AND created_at >= date_trunc('week', now());
  SELECT count(*)::integer, COALESCE(sum(abs(amount)), 0)::integer
    INTO v_month_count, v_month_coin
    FROM public.store_economic_point_ledger
   WHERE store_id = p_store_id AND entry_kind = 'CONVERT_TO_BUSINESS_CASH'
     AND created_at >= date_trunc('month', now());
  SELECT max(created_at) INTO v_last_at
    FROM public.store_economic_point_ledger
   WHERE store_id = p_store_id AND entry_kind = 'CONVERT_TO_BUSINESS_CASH';

  IF COALESCE(v_policy.conversion_enabled, true) IS NOT TRUE THEN
    v_blockers := array_append(v_blockers, 'conversion_disabled');
  END IF;

  IF v_points <= 0 THEN
    v_blockers := array_append(v_blockers, 'amount_required');
  ELSE
    IF v_points < v_min THEN
      v_blockers := array_append(v_blockers, 'below_minimum');
    END IF;
    IF v_unit > 1 AND (v_points % v_unit) <> 0 THEN
      v_blockers := array_append(v_blockers, 'invalid_unit');
    END IF;
  END IF;

  IF v_policy.maximum_conversions_per_day IS NOT NULL
     AND v_day_count >= v_policy.maximum_conversions_per_day THEN
    v_blockers := array_append(v_blockers, 'daily_count_limit');
    v_count_blocked := true;
  END IF;
  IF v_policy.maximum_conversions_per_week IS NOT NULL
     AND v_week_count >= v_policy.maximum_conversions_per_week THEN
    v_blockers := array_append(v_blockers, 'weekly_count_limit');
    v_count_blocked := true;
  END IF;
  IF v_policy.maximum_conversions_per_month IS NOT NULL
     AND v_month_count >= v_policy.maximum_conversions_per_month THEN
    v_blockers := array_append(v_blockers, 'monthly_count_limit');
    v_count_blocked := true;
  END IF;
  IF v_points > 0 AND v_policy.daily_limit_coin IS NOT NULL
     AND (v_day_coin + v_points) > v_policy.daily_limit_coin THEN
    v_blockers := array_append(v_blockers, 'daily_coin_limit');
  END IF;
  IF v_points > 0 AND v_policy.monthly_limit_coin IS NOT NULL
     AND (v_month_coin + v_points) > v_policy.monthly_limit_coin THEN
    v_blockers := array_append(v_blockers, 'monthly_coin_limit');
  END IF;
  IF v_policy.minimum_interval_hours IS NOT NULL AND v_policy.minimum_interval_hours > 0
     AND v_last_at IS NOT NULL
     AND v_last_at > now() - make_interval(hours => v_policy.minimum_interval_hours) THEN
    v_blockers := array_append(v_blockers, 'interval_limit');
    v_count_blocked := true;
  END IF;

  IF v_points > 0 AND v_coin < v_points THEN
    v_blockers := array_append(v_blockers, 'insufficient_store_points');
  END IF;

  IF v_points > 0 THEN
    v_credit := trunc(v_points * v_policy.rate_pesos_per_point * 100);
    IF v_credit <= 0 THEN
      v_blockers := array_append(v_blockers, 'credit_zero');
    END IF;
  END IF;

  -- 지금 전환 가능한 최대 Coin (잔액·일/월 Coin 한도·단위·최소 반영, 횟수·간격·중지로 막히면 0)
  IF COALESCE(v_policy.conversion_enabled, true) IS NOT TRUE OR v_count_blocked OR v_coin <= 0 THEN
    v_max := 0;
  ELSE
    v_max := v_coin;
    IF v_policy.daily_limit_coin IS NOT NULL THEN
      v_max := LEAST(v_max, GREATEST(0, v_policy.daily_limit_coin - v_day_coin));
    END IF;
    IF v_policy.monthly_limit_coin IS NOT NULL THEN
      v_max := LEAST(v_max, GREATEST(0, v_policy.monthly_limit_coin - v_month_coin));
    END IF;
    IF v_unit > 1 THEN
      v_max := (v_max / v_unit) * v_unit;
    END IF;
    IF v_max < v_min OR trunc(v_max * v_policy.rate_pesos_per_point * 100) <= 0 THEN
      v_max := 0;
    END IF;
  END IF;

  IF cardinality(v_blockers) = 0 THEN
    v_cash_pre_settle := v_cash + v_credit;
    IF v_cash_pre_settle > 0 THEN
      v_settle := LEAST(v_cash_pre_settle, v_outstanding);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'can_convert', cardinality(v_blockers) = 0,
    'blockers', to_jsonb(v_blockers),
    'requested_points', GREATEST(v_points, 0),
    'rate_pesos_per_point', v_policy.rate_pesos_per_point,
    'version', v_policy.version,
    'is_default_rate', (v_policy.rate_pesos_per_point = 1),
    'effective_from', v_policy.effective_from,
    'conversion_enabled', COALESCE(v_policy.conversion_enabled, true),
    'minimum_coin', v_min,
    'conversion_unit', v_unit,
    'limits', jsonb_build_object(
      'maximum_conversions_per_day', v_policy.maximum_conversions_per_day,
      'maximum_conversions_per_week', v_policy.maximum_conversions_per_week,
      'maximum_conversions_per_month', v_policy.maximum_conversions_per_month,
      'daily_limit_coin', v_policy.daily_limit_coin,
      'monthly_limit_coin', v_policy.monthly_limit_coin,
      'minimum_interval_hours', v_policy.minimum_interval_hours
    ),
    'usage', jsonb_build_object(
      'day_count', v_day_count, 'day_coin', v_day_coin, 'week_count', v_week_count,
      'month_count', v_month_count, 'month_coin', v_month_coin, 'last_converted_at', v_last_at
    ),
    'max_convertible', v_max,
    'coin_before', v_coin,
    'cash_before_minor', v_cash,
    'outstanding_fee_minor', v_outstanding,
    'coin_after', CASE WHEN cardinality(v_blockers) = 0 THEN v_coin - v_points END,
    'cash_credit_minor', CASE WHEN cardinality(v_blockers) = 0 THEN v_credit END,
    'fee_settle_minor', CASE WHEN cardinality(v_blockers) = 0 THEN v_settle END,
    'cash_after_minor', CASE WHEN cardinality(v_blockers) = 0 THEN v_cash + v_credit - v_settle END,
    'cash_net_increase_minor', CASE WHEN cardinality(v_blockers) = 0 THEN v_credit - v_settle END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_store_coin_conversion(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_store_coin_conversion(uuid, uuid, integer) TO service_role;

COMMENT ON FUNCTION public.preview_store_coin_conversion IS
  'P0 DB-2: read-only Coin→Cash preview with the same policy checks/order as convert_store_economic_points_to_business_cash. Not a guarantee — convert re-checks inside its TX.';

COMMIT;
