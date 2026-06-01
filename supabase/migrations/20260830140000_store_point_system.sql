-- DIBAY 매장 포인트: 잔액·원장·정책·입금신청·플랫폼 문의 + RPC
BEGIN;

-- ---------------------------------------------------------------------------
-- stores: 매장 포인트 잔액·주문 차단 overlay
-- ---------------------------------------------------------------------------
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS point_balance integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS point_commerce_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS point_block_reason text NULL,
  ADD COLUMN IF NOT EXISTS point_warning_at timestamptz NULL;

COMMENT ON COLUMN public.stores.point_balance IS '매장 운영 포인트(사용자 profiles.points 와 분리)';
COMMENT ON COLUMN public.stores.point_commerce_blocked IS '포인트 부족 등으로 고객 주문 차단( is_open 과 별도 overlay )';
COMMENT ON COLUMN public.stores.point_block_reason IS 'insufficient | null';

-- ---------------------------------------------------------------------------
-- store_point_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_point_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  store_id uuid NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id uuid NULL,
  fee_mode text NOT NULL DEFAULT 'fixed'
    CHECK (fee_mode IN ('fixed', 'percent', 'both')),
  fixed_point integer NOT NULL DEFAULT 10,
  percent_rate numeric(5, 2) NOT NULL DEFAULT 0,
  minimum_point integer NOT NULL DEFAULT 0,
  maximum_point integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_archived boolean NOT NULL DEFAULT false,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  priority integer NOT NULL DEFAULT 100,
  memo text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_point_policies_active_window
  ON public.store_point_policies (is_active, is_archived, starts_at, ends_at, priority);
CREATE INDEX IF NOT EXISTS idx_store_point_policies_store_active
  ON public.store_point_policies (store_id, is_active) WHERE store_id IS NOT NULL;

COMMENT ON TABLE public.store_point_policies IS '매장 주문 수수료(포인트) 정책 — store_fee_policies 와 별도';

-- ---------------------------------------------------------------------------
-- store_point_ledger (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_point_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  order_id uuid NULL,
  entry_type text NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  related_type text NOT NULL DEFAULT 'store_order',
  related_id text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  actor_type text NOT NULL DEFAULT 'system',
  actor_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_store_point_ledger_order_fee
  ON public.store_point_ledger (store_id, order_id, entry_type)
  WHERE entry_type = 'store_order_fee' AND order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_store_point_ledger_store_created
  ON public.store_point_ledger (store_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- store_point_charge_requests (매장 입금 신청 — point_charge_requests 와 분리)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_point_charge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payment_method text NOT NULL DEFAULT 'manual_confirm',
  payment_amount integer NOT NULL DEFAULT 0,
  point_amount integer NOT NULL DEFAULT 0,
  request_status text NOT NULL DEFAULT 'pending',
  depositor_name text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  receipt_image_url text NOT NULL DEFAULT '',
  user_memo text NULL,
  admin_memo text NULL,
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_point_charge_requests_store_requested
  ON public.store_point_charge_requests (store_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_point_charge_requests_status
  ON public.store_point_charge_requests (request_status, requested_at DESC);

-- ---------------------------------------------------------------------------
-- platform_admin_inquiries (사용자/매장 → DIBAY 관리자)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_admin_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_type text NOT NULL DEFAULT 'general'
    CHECK (inquiry_type IN ('general', 'store_ops', 'store_point', 'settlement', 'ad')),
  inquiry_kind text NOT NULL DEFAULT 'general'
    CHECK (inquiry_kind IN ('general', 'account_request', 'charge_followup')),
  store_id uuid NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  content text NOT NULL,
  attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'closed')),
  answer text NULL,
  answered_by uuid NULL,
  answered_at timestamptz NULL,
  related_charge_request_id uuid NULL REFERENCES public.store_point_charge_requests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_admin_inquiries_status_created
  ON public.platform_admin_inquiries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_admin_inquiries_type
  ON public.platform_admin_inquiries (inquiry_type, created_at DESC);

-- default policy seed
INSERT INTO public.store_point_policies (
  policy_name, store_id, category_id, fee_mode, fixed_point, percent_rate,
  minimum_point, maximum_point, is_active, priority
)
SELECT
  'Default store order fee (10P)',
  NULL, NULL, 'fixed', 10, 0, 0, 0, true, 100
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_point_policies
  WHERE store_id IS NULL AND category_id IS NULL AND is_active = true AND is_archived = false
);

-- ---------------------------------------------------------------------------
-- Helper: compute point fee from policy row + gross (PHP cents as integer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_store_point_fee_amount(
  p_fee_mode text,
  p_fixed_point integer,
  p_percent_rate numeric,
  p_minimum_point integer,
  p_maximum_point integer,
  p_gross_amount integer
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_fixed integer := GREATEST(0, COALESCE(p_fixed_point, 0));
  v_pct numeric := LEAST(100, GREATEST(0, COALESCE(p_percent_rate, 0)));
  v_min integer := GREATEST(0, COALESCE(p_minimum_point, 0));
  v_max integer := GREATEST(0, COALESCE(p_maximum_point, 0));
  v_gross integer := GREATEST(0, COALESCE(p_gross_amount, 0));
  v_pct_fee integer := 0;
  v_total integer := 0;
  v_mode text := COALESCE(NULLIF(trim(p_fee_mode), ''), 'fixed');
BEGIN
  IF v_mode = 'percent' THEN
    v_pct_fee := LEAST(v_gross, floor((v_gross::numeric * v_pct) / 100)::integer);
    v_total := v_pct_fee;
  ELSIF v_mode = 'both' THEN
    v_pct_fee := LEAST(v_gross, floor((v_gross::numeric * v_pct) / 100)::integer);
    v_total := v_fixed + v_pct_fee;
  ELSE
    v_total := v_fixed;
  END IF;
  IF v_min > 0 AND v_total < v_min THEN
    v_total := v_min;
  END IF;
  IF v_max > 0 AND v_total > v_max THEN
    v_total := v_max;
  END IF;
  RETURN GREATEST(0, v_total);
END;
$$;

-- ---------------------------------------------------------------------------
-- Evaluate commerce block from balance + minimum next fee
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_store_point_commerce_block(
  p_store_id uuid,
  p_balance integer,
  p_next_fee integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(p_balance, 0) < GREATEST(1, COALESCE(p_next_fee, 1)) THEN
    UPDATE public.stores
       SET point_commerce_blocked = true,
           point_block_reason = 'insufficient',
           point_warning_at = COALESCE(point_warning_at, now())
     WHERE id = p_store_id;
  ELSE
    UPDATE public.stores
       SET point_commerce_blocked = false,
           point_block_reason = NULL
     WHERE id = p_store_id
       AND point_block_reason = 'insufficient';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- charge_store_points_on_order_accept — 멱등·FOR UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.charge_store_points_on_order_accept(
  p_store_id uuid,
  p_order_id uuid,
  p_gross_amount integer,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_store record;
  v_policy record;
  v_now timestamptz := now();
  v_fee integer;
  v_balance integer;
  v_new_balance integer;
  v_existing uuid;
  v_cat_id uuid;
  v_gross integer := GREATEST(0, COALESCE(p_gross_amount, 0));
BEGIN
  IF p_store_id IS NULL OR p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids');
  END IF;

  SELECT id INTO v_existing
    FROM public.store_point_ledger
   WHERE store_id = p_store_id
     AND order_id = p_order_id
     AND entry_type = 'store_order_fee'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT point_balance INTO v_balance FROM public.stores WHERE id = p_store_id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'fee_amount', 0,
      'balance_after', COALESCE(v_balance, 0)
    );
  END IF;

  SELECT id, point_balance, store_category_id
    INTO v_store
    FROM public.stores
   WHERE id = p_store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;
  v_cat_id := v_store.store_category_id;
  v_balance := COALESCE(v_store.point_balance, 0);

  -- policy: store > category > default
  SELECT * INTO v_policy
    FROM public.store_point_policies
   WHERE is_active = true AND is_archived = false
     AND store_id = p_store_id
     AND (starts_at IS NULL OR starts_at <= v_now)
     AND (ends_at IS NULL OR ends_at > v_now)
   ORDER BY priority ASC, starts_at DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF v_policy IS NULL AND v_cat_id IS NOT NULL THEN
    SELECT * INTO v_policy
      FROM public.store_point_policies
     WHERE is_active = true AND is_archived = false
       AND category_id = v_cat_id AND store_id IS NULL
       AND (starts_at IS NULL OR starts_at <= v_now)
       AND (ends_at IS NULL OR ends_at > v_now)
     ORDER BY priority ASC, starts_at DESC NULLS LAST, created_at DESC
     LIMIT 1;
  END IF;

  IF v_policy IS NULL THEN
    SELECT * INTO v_policy
      FROM public.store_point_policies
     WHERE is_active = true AND is_archived = false
       AND store_id IS NULL AND category_id IS NULL
       AND (starts_at IS NULL OR starts_at <= v_now)
       AND (ends_at IS NULL OR ends_at > v_now)
     ORDER BY priority ASC, starts_at DESC NULLS LAST, created_at DESC
     LIMIT 1;
  END IF;

  IF v_policy IS NULL THEN
    v_fee := 10;
  ELSE
    v_fee := public.compute_store_point_fee_amount(
      v_policy.fee_mode,
      v_policy.fixed_point,
      v_policy.percent_rate,
      v_policy.minimum_point,
      v_policy.maximum_point,
      v_gross
    );
  END IF;

  IF v_balance < v_fee THEN
    PERFORM public.evaluate_store_point_commerce_block(p_store_id, v_balance, v_fee);
    RETURN jsonb_build_object('ok', false, 'error', 'store_points_insufficient', 'required', v_fee, 'balance', v_balance);
  END IF;

  v_new_balance := v_balance - v_fee;
  UPDATE public.stores SET point_balance = v_new_balance WHERE id = p_store_id;

  INSERT INTO public.store_point_ledger (
    store_id, order_id, entry_type, amount, balance_after,
    policy_snapshot, related_type, related_id, description, actor_type, actor_user_id
  ) VALUES (
    p_store_id,
    p_order_id,
    'store_order_fee',
    -v_fee,
    v_new_balance,
    CASE WHEN v_policy IS NULL THEN '{"source":"fallback","fixed_point":10}'::jsonb
         ELSE to_jsonb(v_policy) END,
    'store_order',
    p_order_id::text,
    'Store order acceptance fee',
    CASE WHEN p_actor_user_id IS NULL THEN 'system' ELSE 'user' END,
    p_actor_user_id
  );

  PERFORM public.evaluate_store_point_commerce_block(p_store_id, v_new_balance, v_fee);

  RETURN jsonb_build_object(
    'ok', true,
    'fee_amount', v_fee,
    'balance_after', v_new_balance,
    'idempotent', false
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- approve_store_point_charge_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_store_point_charge_request(
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
  v_next_fee integer := 10;
BEGIN
  SELECT * INTO v_req
    FROM public.store_point_charge_requests
   WHERE id = p_request_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_req.request_status NOT IN ('pending', 'waiting_confirm', 'on_hold') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_processed');
  END IF;

  SELECT point_balance INTO v_balance
    FROM public.stores
   WHERE id = v_req.store_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  v_new_balance := COALESCE(v_balance, 0) + GREATEST(0, v_req.point_amount);
  UPDATE public.stores SET point_balance = v_new_balance WHERE id = v_req.store_id;

  UPDATE public.store_point_charge_requests
     SET request_status = 'approved',
         approved_by = p_admin_user_id,
         approved_at = now(),
         updated_at = now()
   WHERE id = p_request_id;

  INSERT INTO public.store_point_ledger (
    store_id, order_id, entry_type, amount, balance_after,
    policy_snapshot, related_type, related_id, description, actor_type, actor_user_id
  ) VALUES (
    v_req.store_id,
    NULL,
    'store_charge',
    v_req.point_amount,
    v_new_balance,
    jsonb_build_object('charge_request_id', p_request_id),
    'store_point_charge',
    p_request_id::text,
    'Store point charge approved',
    'admin',
    p_admin_user_id
  );

  SELECT public.compute_store_point_fee_amount(
    COALESCE(p.fee_mode, 'fixed'),
    COALESCE(p.fixed_point, 10),
    COALESCE(p.percent_rate, 0),
    COALESCE(p.minimum_point, 0),
    COALESCE(p.maximum_point, 0),
    0
  ) INTO v_next_fee
  FROM public.store_point_policies p
  WHERE p.is_active = true AND p.is_archived = false
    AND p.store_id IS NULL AND p.category_id IS NULL
  ORDER BY p.priority ASC
  LIMIT 1;

  PERFORM public.evaluate_store_point_commerce_block(v_req.store_id, v_new_balance, COALESCE(v_next_fee, 10));

  RETURN jsonb_build_object(
    'ok', true,
    'store_id', v_req.store_id,
    'point_amount', v_req.point_amount,
    'balance_after', v_new_balance
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin summary RPC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_store_points_admin_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked bigint;
  v_pending_charges bigint;
  v_recent_deduct jsonb;
  v_recent_charge jsonb;
BEGIN
  SELECT count(*) INTO v_blocked
    FROM public.stores
   WHERE point_commerce_blocked = true;

  SELECT count(*) INTO v_pending_charges
    FROM public.store_point_charge_requests
   WHERE request_status IN ('pending', 'waiting_confirm', 'on_hold');

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent_deduct
  FROM (
    SELECT l.store_id, s.store_name, l.amount, l.balance_after, l.created_at, l.order_id
      FROM public.store_point_ledger l
      JOIN public.stores s ON s.id = l.store_id
     WHERE l.entry_type = 'store_order_fee'
     ORDER BY l.created_at DESC
     LIMIT 20
  ) t;

  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent_charge
  FROM (
    SELECT c.id, c.store_id, s.store_name, c.point_amount, c.request_status, c.requested_at
      FROM public.store_point_charge_requests c
      JOIN public.stores s ON s.id = c.store_id
     ORDER BY c.requested_at DESC
     LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'blocked_store_count', v_blocked,
    'pending_charge_count', v_pending_charges,
    'recent_deductions', v_recent_deduct,
    'recent_charges', v_recent_charge
  );
END;
$$;

-- RLS enable (service role API only for writes; minimal read policies later)
ALTER TABLE public.store_point_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_point_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_point_charge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admin_inquiries ENABLE ROW LEVEL SECURITY;

-- Grants for SECURITY DEFINER RPCs
REVOKE ALL ON FUNCTION public.charge_store_points_on_order_accept(uuid, uuid, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_store_point_charge_request(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_store_points_admin_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.charge_store_points_on_order_accept(uuid, uuid, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_store_point_charge_request(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_store_points_admin_summary() TO service_role;

COMMIT;
