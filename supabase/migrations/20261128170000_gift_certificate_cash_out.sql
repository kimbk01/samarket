-- O3-B: Gift Revenue external cash-out (separate from Store Cash conversion).
-- Source = recognized available Gift Revenue only.
-- PAID = Admin mark-paid after real external transfer (no fake auto-payout).

-- ---------------------------------------------------------------------------
-- 1) Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_cash_out_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED', 'REJECTED', 'APPROVED', 'PAID', 'CANCELLED')),
  destination_type text NOT NULL
    CHECK (destination_type IN ('gcash', 'bank')),
  account_number text NOT NULL,
  account_name text NOT NULL,
  bank_name text NULL,
  idempotency_key text NOT NULL,
  rejected_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  rejected_at timestamptz NULL,
  rejection_reason text NULL,
  approved_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  paid_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  paid_at timestamptz NULL,
  payout_method text NULL,
  payout_reference text NULL,
  payout_note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_cash_out_requests_idempotency_uq UNIQUE (idempotency_key),
  CONSTRAINT gift_certificate_cash_out_bank_name_chk CHECK (
    (destination_type = 'gcash' AND (bank_name IS NULL OR btrim(bank_name) = ''))
    OR (destination_type = 'bank' AND bank_name IS NOT NULL AND btrim(bank_name) <> '')
  )
);

COMMENT ON TABLE public.gift_certificate_cash_out_requests IS
  'O3-B Owner requests to cash out available Gift Revenue externally (GCash/bank). Not Store Cash conversion.';

CREATE INDEX IF NOT EXISTS gift_certificate_cash_out_requests_store_idx
  ON public.gift_certificate_cash_out_requests (store_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS gift_certificate_cash_out_requests_status_idx
  ON public.gift_certificate_cash_out_requests (status, created_at DESC);

ALTER TABLE public.gift_certificate_cash_out_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gift_certificate_cash_out_requests_select ON public.gift_certificate_cash_out_requests;
CREATE POLICY gift_certificate_cash_out_requests_select
  ON public.gift_certificate_cash_out_requests
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = gift_certificate_cash_out_requests.store_id
         AND s.owner_user_id = auth.uid()
    )
    OR public.is_platform_admin(auth.uid())
  );

REVOKE ALL ON TABLE public.gift_certificate_cash_out_requests FROM PUBLIC;
GRANT SELECT ON TABLE public.gift_certificate_cash_out_requests TO authenticated;
GRANT ALL ON TABLE public.gift_certificate_cash_out_requests TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Available = ledger (incl. cash-out hold/release/paid) − pending conversion REQUESTED
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_store_revenue_available(p_store_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    COALESCE((
      SELECT SUM(r.amount)::integer
      FROM public.gift_certificate_revenue_ledger r
      WHERE r.store_id = p_store_id
        AND r.entry_type IN (
          'REVENUE_AVAILABLE',
          'CONVERSION_APPROVE',
          'REVERSED',
          'RECOGNITION_CORRECTION',
          'CASH_OUT_HOLD',
          'CASH_OUT_RELEASE',
          'CASH_OUT_PAID'
        )
    ), 0)
    - COALESCE((
      SELECT SUM(c.amount)::integer
      FROM public.gift_certificate_conversion_requests c
      WHERE c.store_id = p_store_id
        AND c.status = 'REQUESTED'
    ), 0)
  )::integer;
$$;

COMMENT ON FUNCTION public.gift_certificate_store_revenue_available(uuid) IS
  'Available Gift Revenue: ledger (incl. CASH_OUT_HOLD/RELEASE/PAID) minus open Store Cash conversion REQUESTED.';

-- ---------------------------------------------------------------------------
-- 3) gift_certificate_cash_out_request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_cash_out_request(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_amount integer,
  p_destination_type text,
  p_account_number text,
  p_account_name text,
  p_bank_name text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_dest text := lower(nullif(btrim(coalesce(p_destination_type, '')), ''));
  v_acct_no text := nullif(btrim(coalesce(p_account_number, '')), '');
  v_acct_name text := nullif(btrim(coalesce(p_account_name, '')), '');
  v_bank text := nullif(btrim(coalesce(p_bank_name, '')), '');
  v_existing uuid;
  v_available integer;
  v_request_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR coalesce(p_amount, 0) <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF v_dest IS NULL OR v_dest NOT IN ('gcash', 'bank') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_destination_type');
  END IF;
  IF v_acct_no IS NULL OR v_acct_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'destination_fields_required');
  END IF;
  IF v_dest = 'bank' AND v_bank IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bank_name_required');
  END IF;
  IF v_dest = 'gcash' THEN
    v_bank := NULL;
  END IF;

  SELECT id INTO v_existing
    FROM public.gift_certificate_cash_out_requests
   WHERE idempotency_key = v_key
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_existing);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores s
     WHERE s.id = p_store_id
       AND s.owner_user_id = p_owner_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_store_owner');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.store_cash_recovery_obligations o
     WHERE o.store_id = p_store_id
       AND o.status IN ('OPEN', 'PARTIALLY_CLEARED')
       AND o.amount_remaining > 0
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'open_recovery_obligation');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('gift_rev:' || p_store_id::text));

  v_available := public.gift_certificate_store_revenue_available(p_store_id);
  IF v_available < p_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_available_revenue',
      'available', v_available
    );
  END IF;

  INSERT INTO public.gift_certificate_cash_out_requests (
    store_id, owner_user_id, amount, status,
    destination_type, account_number, account_name, bank_name,
    idempotency_key
  ) VALUES (
    p_store_id, p_owner_user_id, p_amount, 'REQUESTED',
    v_dest, v_acct_no, v_acct_name, v_bank,
    v_key
  )
  RETURNING id INTO v_request_id;

  INSERT INTO public.gift_certificate_revenue_ledger (
    store_id, redemption_id, entry_type, amount, related_type, related_id
  ) VALUES (
    p_store_id, NULL, 'CASH_OUT_HOLD', -p_amount,
    'cash_out_request', v_request_id::text || ':hold'
  );

  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'amount', p_amount);
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing
      FROM public.gift_certificate_cash_out_requests
     WHERE idempotency_key = v_key
     LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_existing);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) gift_certificate_cash_out_cancel (owner, REQUESTED only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_cash_out_cancel(
  p_owner_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.gift_certificate_cash_out_requests%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_owner_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_req
    FROM public.gift_certificate_cash_out_requests
   WHERE id = p_request_id
     AND status = 'REQUESTED'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_cancellable');
  END IF;

  IF v_req.owner_user_id IS DISTINCT FROM p_owner_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_request_owner');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('gift_rev:' || v_req.store_id::text));

  INSERT INTO public.gift_certificate_revenue_ledger (
    store_id, redemption_id, entry_type, amount, related_type, related_id
  ) VALUES (
    v_req.store_id, NULL, 'CASH_OUT_RELEASE', v_req.amount,
    'cash_out_request', v_req.id::text || ':release'
  );

  UPDATE public.gift_certificate_cash_out_requests
     SET status = 'CANCELLED'
   WHERE id = v_req.id
     AND status = 'REQUESTED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_cash_out_cancel_race: request % no longer REQUESTED', v_req.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'status', 'CANCELLED');
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', p_request_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) gift_certificate_cash_out_reject (admin)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_cash_out_reject(
  p_admin_user_id uuid,
  p_request_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.gift_certificate_cash_out_requests%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT * INTO v_req
    FROM public.gift_certificate_cash_out_requests
   WHERE id = p_request_id
     AND status IN ('REQUESTED', 'APPROVED')
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_rejectable');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('gift_rev:' || v_req.store_id::text));

  INSERT INTO public.gift_certificate_revenue_ledger (
    store_id, redemption_id, entry_type, amount, related_type, related_id
  ) VALUES (
    v_req.store_id, NULL, 'CASH_OUT_RELEASE', v_req.amount,
    'cash_out_request', v_req.id::text || ':release'
  );

  UPDATE public.gift_certificate_cash_out_requests
     SET status = 'REJECTED',
         rejected_by = p_admin_user_id,
         rejected_at = now(),
         rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = v_req.id
     AND status IN ('REQUESTED', 'APPROVED');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_cash_out_reject_race: request %', v_req.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'status', 'REJECTED');
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', p_request_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) gift_certificate_cash_out_approve (admin gate; no fake payout)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_cash_out_approve(
  p_admin_user_id uuid,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.gift_certificate_cash_out_requests%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT * INTO v_req
    FROM public.gift_certificate_cash_out_requests
   WHERE id = p_request_id
     AND status = 'REQUESTED'
   FOR UPDATE;
  IF NOT FOUND THEN
    -- Idempotent if already approved/paid
    SELECT * INTO v_req
      FROM public.gift_certificate_cash_out_requests
     WHERE id = p_request_id
     LIMIT 1;
    IF FOUND AND v_req.status IN ('APPROVED', 'PAID') THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', p_request_id, 'status', v_req.status);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_pending');
  END IF;

  UPDATE public.gift_certificate_cash_out_requests
     SET status = 'APPROVED',
         approved_by = p_admin_user_id,
         approved_at = now()
   WHERE id = v_req.id
     AND status = 'REQUESTED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_cash_out_approve_race: request %', v_req.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'status', 'APPROVED');
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) gift_certificate_cash_out_mark_paid — consume once; method+reference required
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_cash_out_mark_paid(
  p_admin_user_id uuid,
  p_request_id uuid,
  p_payout_method text,
  p_payout_reference text,
  p_payout_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.gift_certificate_cash_out_requests%ROWTYPE;
  v_method text := nullif(btrim(coalesce(p_payout_method, '')), '');
  v_ref text := nullif(btrim(coalesce(p_payout_reference, '')), '');
  v_note text := nullif(btrim(coalesce(p_payout_note, '')), '');
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR p_request_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF v_method IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_method_required');
  END IF;
  IF v_ref IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_reference_required');
  END IF;

  SELECT * INTO v_req
    FROM public.gift_certificate_cash_out_requests
   WHERE id = p_request_id
     AND status = 'APPROVED'
   FOR UPDATE;
  IF NOT FOUND THEN
    SELECT * INTO v_req
      FROM public.gift_certificate_cash_out_requests
     WHERE id = p_request_id
     LIMIT 1;
    IF FOUND AND v_req.status = 'PAID' THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', p_request_id, 'status', 'PAID');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_approved');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('gift_rev:' || v_req.store_id::text));

  -- HOLD already reduced available; CASH_OUT_PAID is audit marker (amount 0) — consume once via unique related_id.
  INSERT INTO public.gift_certificate_revenue_ledger (
    store_id, redemption_id, entry_type, amount, related_type, related_id
  ) VALUES (
    v_req.store_id, NULL, 'CASH_OUT_PAID', 0,
    'cash_out_request', v_req.id::text || ':paid'
  );

  UPDATE public.gift_certificate_cash_out_requests
     SET status = 'PAID',
         paid_by = p_admin_user_id,
         paid_at = now(),
         payout_method = v_method,
         payout_reference = v_ref,
         payout_note = v_note
   WHERE id = v_req.id
     AND status = 'APPROVED';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gift_cash_out_mark_paid_race: request %', v_req.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_req.id,
    'status', 'PAID',
    'amount', v_req.amount
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', p_request_id, 'status', 'PAID');
END;
$$;

REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_request(
  uuid, uuid, integer, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_cancel(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_reject(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_approve(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_certificate_cash_out_mark_paid(uuid, uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_request(
  uuid, uuid, integer, text, text, text, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_cancel(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_reject(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_approve(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_certificate_cash_out_mark_paid(uuid, uuid, text, text, text) TO service_role;
