-- DIBAY Currency SSOT CUT 2 — Coin inflow writers + unified Coin withdrawal rail
-- Gift cash-out merges into coin_withdrawal_requests (owner decision).
-- Does NOT mutate legacy Business Credit, Gift Store Cash, or delivery_ad_accounts balances.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Expand store_economic_point_ledger entry kinds
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.store_economic_point_ledger
  DROP CONSTRAINT IF EXISTS store_economic_point_ledger_entry_kind_check;

ALTER TABLE public.store_economic_point_ledger
  ADD CONSTRAINT store_economic_point_ledger_entry_kind_check
  CHECK (entry_kind IN (
    'ECONOMIC_INFLOW',
    'SALE_EARN',
    'GIFT_REDEMPTION_EARN',
    'REVERSAL',
    'CONVERT_TO_BUSINESS_CASH',
    'WITHDRAWAL',
    'WITHDRAWAL_REQUEST',
    'WITHDRAWAL_COMPLETE',
    'WITHDRAWAL_REJECT',
    'WITHDRAWAL_RELEASE',
    'ADMIN_ADJUST',
    'SYSTEM'
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- Coin withdrawal requests (canonical — absorbs gift external cash-out)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.coin_withdrawal_requests (
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
  source_kind text NOT NULL DEFAULT 'coin'
    CHECK (source_kind IN ('coin', 'gift_cash_out_bridge')),
  idempotency_key text NOT NULL,
  hold_ledger_id uuid NULL,
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
  CONSTRAINT coin_withdrawal_requests_idempotency_uq UNIQUE (idempotency_key),
  CONSTRAINT coin_withdrawal_bank_name_chk CHECK (
    (destination_type = 'gcash' AND (bank_name IS NULL OR btrim(bank_name) = ''))
    OR (destination_type = 'bank' AND bank_name IS NOT NULL AND btrim(bank_name) <> '')
  )
);

COMMENT ON TABLE public.coin_withdrawal_requests IS
  'Canonical Coin withdrawal rail. Gift external cash-out bridges here (source_kind=gift_cash_out_bridge).';

CREATE INDEX IF NOT EXISTS coin_withdrawal_requests_store_idx
  ON public.coin_withdrawal_requests (store_id, status, created_at DESC);

ALTER TABLE public.coin_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coin_withdrawal_requests_select ON public.coin_withdrawal_requests;
CREATE POLICY coin_withdrawal_requests_select
  ON public.coin_withdrawal_requests FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = coin_withdrawal_requests.store_id
         AND s.owner_user_id = auth.uid()
    )
    OR public.is_platform_admin(auth.uid())
  );

REVOKE ALL ON TABLE public.coin_withdrawal_requests FROM PUBLIC;
GRANT SELECT ON TABLE public.coin_withdrawal_requests TO authenticated;
GRANT ALL ON TABLE public.coin_withdrawal_requests TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- credit_coin_from_settlement — sale net → Coin
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.credit_coin_from_settlement(
  p_store_id uuid,
  p_settlement_id uuid,
  p_order_id uuid,
  p_amount integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_ledger uuid;
  v_bal integer;
BEGIN
  IF p_store_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_ledger
    FROM public.store_economic_point_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_ledger);
  END IF;

  PERFORM public.ensure_store_economic_point_account(p_store_id);

  UPDATE public.store_economic_point_accounts
     SET balance = balance + p_amount, updated_at = now()
   WHERE store_id = p_store_id
   RETURNING balance INTO v_bal;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, meta
  ) VALUES (
    p_store_id, 'SALE_EARN', p_amount, v_bal,
    'store_settlement', coalesce(p_settlement_id::text, p_order_id::text, ''),
    v_key, 'system',
    jsonb_build_object('order_id', p_order_id, 'settlement_id', p_settlement_id)
  ) RETURNING id INTO v_ledger;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'ledger_id', v_ledger, 'balance_after', v_bal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_coin_from_settlement(uuid, uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_coin_from_settlement(uuid, uuid, uuid, integer, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- credit_coin_from_gift_revenue — gift REVENUE_AVAILABLE → Coin
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.credit_coin_from_gift_revenue(
  p_store_id uuid,
  p_redemption_id uuid,
  p_amount integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_ledger uuid;
  v_bal integer;
BEGIN
  IF p_store_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_ledger
    FROM public.store_economic_point_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'ledger_id', v_ledger);
  END IF;

  PERFORM public.ensure_store_economic_point_account(p_store_id);

  UPDATE public.store_economic_point_accounts
     SET balance = balance + p_amount, updated_at = now()
   WHERE store_id = p_store_id
   RETURNING balance INTO v_bal;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, meta
  ) VALUES (
    p_store_id, 'GIFT_REDEMPTION_EARN', p_amount, v_bal,
    'gift_redemption', coalesce(p_redemption_id::text, ''),
    v_key, 'system',
    jsonb_build_object('redemption_id', p_redemption_id)
  ) RETURNING id INTO v_ledger;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'ledger_id', v_ledger, 'balance_after', v_bal
  );
END;
$$;

REVOKE ALL ON FUNCTION public.credit_coin_from_gift_revenue(uuid, uuid, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_coin_from_gift_revenue(uuid, uuid, integer, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- coin_withdrawal_request — hold Coin balance
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.coin_withdrawal_request(
  p_owner_user_id uuid,
  p_store_id uuid,
  p_amount integer,
  p_destination_type text,
  p_account_number text,
  p_account_name text,
  p_bank_name text,
  p_idempotency_key text,
  p_source_kind text DEFAULT 'coin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_req_id uuid;
  v_bal integer;
  v_new_bal integer;
  v_hold_ledger uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_owner_user_id IS NULL OR p_store_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_req_id FROM public.coin_withdrawal_requests WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_req_id);
  END IF;

  PERFORM public.ensure_store_economic_point_account(p_store_id);

  SELECT balance INTO v_bal
    FROM public.store_economic_point_accounts
   WHERE store_id = p_store_id
   FOR UPDATE;

  IF coalesce(v_bal, 0) < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_coin', 'balance', coalesce(v_bal, 0));
  END IF;

  v_new_bal := v_bal - p_amount;
  UPDATE public.store_economic_point_accounts
     SET balance = v_new_bal, updated_at = now()
   WHERE store_id = p_store_id;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    p_store_id, 'WITHDRAWAL_REQUEST', -p_amount, v_new_bal,
    'coin_withdrawal', v_key,
    v_key || ':hold', 'owner', p_owner_user_id,
    jsonb_build_object('amount', p_amount)
  ) RETURNING id INTO v_hold_ledger;

  INSERT INTO public.coin_withdrawal_requests (
    store_id, owner_user_id, amount, status,
    destination_type, account_number, account_name, bank_name,
    source_kind, idempotency_key, hold_ledger_id
  ) VALUES (
    p_store_id, p_owner_user_id, p_amount, 'REQUESTED',
    lower(btrim(p_destination_type)), btrim(p_account_number), btrim(p_account_name),
    nullif(btrim(coalesce(p_bank_name, '')), ''),
    coalesce(nullif(btrim(p_source_kind), ''), 'coin'),
    v_key, v_hold_ledger
  ) RETURNING id INTO v_req_id;

  RETURN jsonb_build_object(
    'ok', true, 'request_id', v_req_id, 'balance_after', v_new_bal
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_req_id FROM public.coin_withdrawal_requests WHERE idempotency_key = v_key;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'request_id', v_req_id);
END;
$$;

REVOKE ALL ON FUNCTION public.coin_withdrawal_request(uuid, uuid, integer, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_withdrawal_request(uuid, uuid, integer, text, text, text, text, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- coin_withdrawal_reject — release hold back to Coin
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.coin_withdrawal_reject(
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
  v_req public.coin_withdrawal_requests%ROWTYPE;
  v_bal integer;
  v_new_bal integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT * INTO v_req
    FROM public.coin_withdrawal_requests
   WHERE id = p_request_id AND status = 'REQUESTED'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_pending');
  END IF;

  PERFORM public.ensure_store_economic_point_account(v_req.store_id);
  SELECT balance INTO v_bal FROM public.store_economic_point_accounts WHERE store_id = v_req.store_id FOR UPDATE;
  v_new_bal := coalesce(v_bal, 0) + v_req.amount;

  UPDATE public.store_economic_point_accounts
     SET balance = v_new_bal, updated_at = now()
   WHERE store_id = v_req.store_id;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    v_req.store_id, 'WITHDRAWAL_RELEASE', v_req.amount, v_new_bal,
    'coin_withdrawal', v_req.id::text,
    'coin_wd_reject:' || v_req.id::text, 'admin', p_admin_user_id,
    jsonb_build_object('reason', p_reason)
  );

  UPDATE public.coin_withdrawal_requests
     SET status = 'REJECTED',
         rejected_by = p_admin_user_id,
         rejected_at = now(),
         rejection_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = v_req.id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'balance_after', v_new_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.coin_withdrawal_reject(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_withdrawal_reject(uuid, uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- coin_withdrawal_mark_paid — permanent debit (hold already taken)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.coin_withdrawal_mark_paid(
  p_admin_user_id uuid,
  p_request_id uuid,
  p_payout_method text DEFAULT NULL,
  p_payout_reference text DEFAULT NULL,
  p_payout_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.coin_withdrawal_requests%ROWTYPE;
  v_bal integer;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT * INTO v_req
    FROM public.coin_withdrawal_requests
   WHERE id = p_request_id AND status IN ('REQUESTED', 'APPROVED')
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'request_not_payable');
  END IF;

  SELECT balance INTO v_bal FROM public.store_economic_point_accounts WHERE store_id = v_req.store_id;

  INSERT INTO public.store_economic_point_ledger (
    store_id, entry_kind, amount, balance_after, related_type, related_id,
    idempotency_key, actor_type, actor_user_id, meta
  ) VALUES (
    v_req.store_id, 'WITHDRAWAL_COMPLETE', 0, coalesce(v_bal, 0),
    'coin_withdrawal', v_req.id::text,
    'coin_wd_paid:' || v_req.id::text, 'admin', p_admin_user_id,
    jsonb_build_object(
      'amount', v_req.amount,
      'payout_method', p_payout_method,
      'payout_reference', p_payout_reference
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.coin_withdrawal_requests
     SET status = 'PAID',
         approved_by = coalesce(approved_by, p_admin_user_id),
         approved_at = coalesce(approved_at, now()),
         paid_by = p_admin_user_id,
         paid_at = now(),
         payout_method = nullif(btrim(coalesce(p_payout_method, '')), ''),
         payout_reference = nullif(btrim(coalesce(p_payout_reference, '')), ''),
         payout_note = nullif(btrim(coalesce(p_payout_note, '')), '')
   WHERE id = v_req.id;

  RETURN jsonb_build_object('ok', true, 'request_id', v_req.id, 'status', 'PAID');
END;
$$;

REVOKE ALL ON FUNCTION public.coin_withdrawal_mark_paid(uuid, uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coin_withdrawal_mark_paid(uuid, uuid, text, text, text) TO service_role;

COMMIT;
