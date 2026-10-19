-- D-1 (Owner 승인) · DEF-3: 수수료 정책 예약 변경을 한 트랜잭션으로 처리한다.
-- 이전 구현은 (1) 기존 정책 ends_at 갱신 → (2) 새 정책 INSERT 를 별도 요청으로 실행해
-- (2) 실패·중단 시 정책 공백(트리거 `store_commission_policy_missing` → 주문 진행 차단)이 생길 수 있었다.
--
-- 호출: app/api/admin/store-fee-policies (POST, supersede_policy_id) — service_role 전용.
-- 수수료 금액은 여기서 계산·기록하지 않는다 (SSOT: DB 트리거). 정책 행만 다룬다.
--
-- 기존 정책 행 잠금(FOR UPDATE) 아래에서:
--   없음 → supersede_policy_not_found / 보관됨 → policy_archived
--   새 시작 시각 없음 → supersede_requires_starts_at
--   새 시작 시각 ≤ 기존 시작 시각 → supersede_window_invalid (기존 정책 구간이 비거나 음수가 됨)
--   p_expected_updated_at 지정 시 불일치 → stale_policy (화면 로드 이후 다른 관리자가 변경)
-- 실패하면 기존 정책 종료도 새 정책 생성도 남지 않는다.
-- **운영 DB 적용은 Owner 배포 승인 후** (D-0 선결 확인).

CREATE OR REPLACE FUNCTION public.admin_supersede_store_fee_policy(
  p_supersede_id uuid,
  p_new jsonb,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev public.store_fee_policies%ROWTYPE;
  v_starts timestamptz;
  v_ends timestamptz;
  v_new_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_supersede_id IS NULL OR p_new IS NULL OR coalesce(btrim(p_new->>'policy_name'), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  v_starts := nullif(p_new->>'starts_at', '')::timestamptz;
  v_ends := nullif(p_new->>'ends_at', '')::timestamptz;
  IF v_starts IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'supersede_requires_starts_at');
  END IF;
  IF v_ends IS NOT NULL AND v_ends <= v_starts THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_window');
  END IF;

  SELECT * INTO v_prev
    FROM public.store_fee_policies
   WHERE id = p_supersede_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'supersede_policy_not_found');
  END IF;
  IF coalesce(v_prev.is_archived, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'policy_archived');
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_prev.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_policy');
  END IF;
  IF v_prev.starts_at IS NOT NULL AND v_starts <= v_prev.starts_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'supersede_window_invalid');
  END IF;

  UPDATE public.store_fee_policies
     SET ends_at = v_starts
   WHERE id = p_supersede_id;

  INSERT INTO public.store_fee_policies (
    policy_name, store_id, category_id, topic_id,
    fee_percent, fixed_fee, delivery_fee_mode, delivery_fee_percent,
    is_active, starts_at, ends_at, priority, memo
  ) VALUES (
    left(btrim(p_new->>'policy_name'), 80),
    nullif(p_new->>'store_id', '')::uuid,
    nullif(p_new->>'category_id', '')::uuid,
    nullif(p_new->>'topic_id', '')::uuid,
    coalesce((p_new->>'fee_percent')::numeric, 0),
    greatest(0, coalesce(round((p_new->>'fixed_fee')::numeric)::integer, 0)),
    coalesce(nullif(btrim(p_new->>'delivery_fee_mode'), ''), 'none'),
    coalesce((p_new->>'delivery_fee_percent')::numeric, 0),
    coalesce((p_new->>'is_active')::boolean, true),
    v_starts,
    v_ends,
    greatest(0, coalesce((p_new->>'priority')::integer, 100)),
    nullif(left(p_new->>'memo', 1000), '')
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_new_id,
    'superseded_policy_id', v_prev.id,
    'superseded_prev_ends_at', v_prev.ends_at,
    'superseded_new_ends_at', v_starts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_supersede_store_fee_policy(uuid, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_supersede_store_fee_policy(uuid, jsonb, timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_supersede_store_fee_policy(uuid, jsonb, timestamptz) TO service_role;

COMMENT ON FUNCTION public.admin_supersede_store_fee_policy(uuid, jsonb, timestamptz) IS
  'DEF-3/D-1: 수수료 정책 예약 변경 — 기존 정책 종료 + 새 정책 생성 단일 트랜잭션 (service_role 전용).';
