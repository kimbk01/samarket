-- 사용자 포인트 충전 플랜 + 충전 신청 처리 이력 컬럼

CREATE TABLE IF NOT EXISTS public.point_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ko text NOT NULL,
  name_en text NOT NULL,
  description_ko text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  payment_amount integer NOT NULL CHECK (payment_amount >= 0),
  point_amount integer NOT NULL CHECK (point_amount >= 0),
  bonus_amount integer NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT point_plans_currency_check CHECK (currency IN ('PHP', 'KRW', 'USD'))
);

CREATE INDEX IF NOT EXISTS idx_point_plans_active_sort
  ON public.point_plans (is_active, sort_order ASC, created_at ASC);

ALTER TABLE public.point_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "point_plans_select_active" ON public.point_plans;
CREATE POLICY "point_plans_select_active"
  ON public.point_plans
  FOR SELECT
  USING (is_active = true);

ALTER TABLE public.point_charge_requests
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS processed_by uuid NULL;

-- 기본 플랜 (mock-point-plans.ts 와 동일 수치)
INSERT INTO public.point_plans (
  id, name_ko, name_en, description_ko, description_en,
  payment_amount, point_amount, bonus_amount, currency, is_active, sort_order
) VALUES
  (
    'a1000001-0001-4000-8000-000000000001',
    '1,000P',
    '1,000P',
    '₱1,000 결제 시 1,000P',
    '₱1,000 for 1,000P',
    1000, 1000, 0, 'PHP', true, 10
  ),
  (
    'a1000002-0002-4000-8000-000000000002',
    '5,000P (+5% 보너스)',
    '5,000P (+5% bonus)',
    '₱5,000 결제 시 5,250P',
    '₱5,000 for 5,250P',
    5000, 5000, 250, 'PHP', true, 20
  ),
  (
    'a1000003-0003-4000-8000-000000000003',
    '10,000P (+10% 보너스)',
    '10,000P (+10% bonus)',
    '₱10,000 결제 시 11,000P',
    '₱10,000 for 11,000P',
    10000, 10000, 1000, 'PHP', true, 30
  )
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.approve_user_point_charge_request(
  p_request_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req record;
  v_balance integer;
  v_new_balance integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_req
    FROM public.point_charge_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.request_status NOT IN ('pending', 'waiting_confirm', 'on_hold') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  SELECT points INTO v_balance
    FROM public.profiles
   WHERE id = v_req.user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_new_balance := COALESCE(v_balance, 0) + GREATEST(0, v_req.point_amount);
  UPDATE public.profiles SET points = v_new_balance WHERE id = v_req.user_id;

  UPDATE public.point_charge_requests
     SET request_status = 'approved',
         approved_at = now(),
         approved_by = p_admin_user_id,
         processed_at = now(),
         processed_by = p_admin_user_id,
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_req.user_id,
    'charge',
    v_req.point_amount,
    v_new_balance,
    'point_charge',
    p_request_id::text,
    '포인트 충전 승인',
    'admin'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'balance_after', v_new_balance,
    'user_id', v_req.user_id,
    'point_amount', v_req.point_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_user_point_charge_request(uuid, uuid) TO service_role;
