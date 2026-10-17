-- DIBAY Store Commission × Business Cash SSOT
-- Doc: docs/store-commission-cash-settlement-ssot.md
--
-- Payment model: buyers pay the store directly (COD / store GCash / bank transfer).
-- The platform never holds payment_amount, so there is no per-order payout to a store.
-- The platform's revenue (commission) is collected from the store's prepaid Business Cash.
--
-- 1. Commission is charged when the order enters `preparing` (조리 시작), not at `completed`.
--    Same idempotency key `sale_fee:order:{id}` → one charge per order regardless of stage.
-- 2. Shortfall stays an open obligation (business_cash_accounts.balance_minor >= 0 is kept);
--    the store's NET cash position = balance − outstanding, which is negative when short.
-- 3. Cancel / refund after the charge never auto-reverses. The obligation is flagged
--    `review_required` and an admin decides `refunded` (fee back to Cash) or `kept`.
-- 4. Order gate: when admin_settings.store_cash_order_gate = block_when_not_positive,
--    a store whose NET position is <= 0 cannot receive new orders (DB trigger, atomic).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- store_sale_fee_obligations — charge stage, frozen fee snapshot, manual adjustment
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.store_sale_fee_obligations
  ADD COLUMN IF NOT EXISTS charge_stage text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS fee_snapshot jsonb NULL,
  ADD COLUMN IF NOT EXISTS adjustment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS adjustment_trigger text NULL,
  ADD COLUMN IF NOT EXISTS review_flagged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS adjustment_note text NULL,
  ADD COLUMN IF NOT EXISTS adjusted_by uuid NULL,
  ADD COLUMN IF NOT EXISTS adjusted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS adjustment_cash_refunded_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_outstanding_cancelled_minor bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS original_fee_due_minor bigint NULL;

UPDATE public.store_sale_fee_obligations
   SET original_fee_due_minor = fee_due_minor
 WHERE original_fee_due_minor IS NULL AND status <> 'waived';

ALTER TABLE public.store_sale_fee_obligations
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_charge_stage_chk,
  ADD CONSTRAINT store_sale_fee_obligations_charge_stage_chk
    CHECK (charge_stage IN ('preparing', 'completed')),
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_adjustment_status_chk,
  ADD CONSTRAINT store_sale_fee_obligations_adjustment_status_chk
    CHECK (adjustment_status IN ('none', 'review_required', 'refunded', 'kept')),
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_adjustment_trigger_chk,
  ADD CONSTRAINT store_sale_fee_obligations_adjustment_trigger_chk
    CHECK (adjustment_trigger IS NULL OR adjustment_trigger IN ('cancelled', 'refunded'));

CREATE INDEX IF NOT EXISTS store_sale_fee_obligations_review_idx
  ON public.store_sale_fee_obligations (review_flagged_at)
  WHERE adjustment_status = 'review_required';

CREATE INDEX IF NOT EXISTS store_sale_fee_obligations_store_created_idx
  ON public.store_sale_fee_obligations (store_id, created_at DESC);

COMMENT ON COLUMN public.store_sale_fee_obligations.charge_stage IS
  'Order status at which the commission was charged. preparing = 조리 시작 (canonical); completed = legacy / safety net.';
COMMENT ON COLUMN public.store_sale_fee_obligations.adjustment_status IS
  'none | review_required (order cancelled/refunded after charge) | refunded (admin returned fee to Cash) | kept (admin kept fee).';
COMMENT ON COLUMN public.store_sale_fee_obligations.original_fee_due_minor IS
  'Fee charged at charge time. reverse_sale_fee_for_order zeroes fee_due_minor; this keeps the audit amount.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Order gate mode (admin_settings) + NET cash position
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.admin_settings (key, value_json)
VALUES ('store_cash_order_gate', jsonb_build_object('value', 'off'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.store_cash_order_gate_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT value_json->>'value' FROM public.admin_settings WHERE key = 'store_cash_order_gate')
         = 'block_when_not_positive'
      THEN 'block_when_not_positive'
    ELSE 'off'
  END;
$$;

CREATE OR REPLACE FUNCTION public.store_cash_position(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance bigint := 0;
  v_outstanding bigint := 0;
  v_mode text := public.store_cash_order_gate_mode();
  v_net bigint;
BEGIN
  SELECT coalesce(balance_minor, 0) INTO v_balance
    FROM public.business_cash_accounts WHERE store_id = p_store_id;
  SELECT coalesce(sum(fee_outstanding_minor), 0) INTO v_outstanding
    FROM public.store_sale_fee_obligations
   WHERE store_id = p_store_id AND status = 'open';
  v_net := coalesce(v_balance, 0) - coalesce(v_outstanding, 0);
  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'balance_minor', coalesce(v_balance, 0),
    'outstanding_minor', coalesce(v_outstanding, 0),
    'net_minor', v_net,
    'gate_mode', v_mode,
    'orderable', (v_mode = 'off' OR v_net > 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.store_cash_order_gate_mode() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_cash_position(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_cash_order_gate_mode() TO service_role;
GRANT EXECUTE ON FUNCTION public.store_cash_position(uuid) TO service_role;

-- Atomic gate: every store_orders INSERT (create_store_order_atomic) passes here.
CREATE OR REPLACE FUNCTION public.store_orders_enforce_cash_order_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pos jsonb;
BEGIN
  IF public.store_cash_order_gate_mode() = 'off' THEN
    RETURN NEW;
  END IF;
  v_pos := public.store_cash_position(NEW.store_id);
  IF coalesce((v_pos->>'orderable')::boolean, true) IS NOT TRUE THEN
    RAISE EXCEPTION 'store_cash_insufficient'
      USING ERRCODE = 'P0001',
            DETAIL = 'net_minor=' || coalesce(v_pos->>'net_minor', '0');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.store_orders_enforce_cash_order_gate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_store_orders_cash_order_gate ON public.store_orders;
CREATE TRIGGER trg_store_orders_cash_order_gate
  BEFORE INSERT ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_enforce_cash_order_gate();

-- ═══════════════════════════════════════════════════════════════════════════
-- charge_store_commission_for_order — canonical charge (stage + frozen snapshot)
-- Callee charge_sale_fee_for_order stays the single Cash debit writer.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.charge_store_commission_for_order(
  p_store_id uuid,
  p_order_id uuid,
  p_charge_stage text,
  p_commission_base_php integer,
  p_fee_due_php integer,
  p_fee_snapshot jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee jsonb;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_charge_stage IS NULL OR p_charge_stage NOT IN ('preparing', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_charge_stage');
  END IF;

  -- Serialize per order so a concurrent preparing/completed pair charges once.
  PERFORM 1 FROM public.store_orders WHERE id = p_order_id FOR UPDATE;

  v_fee := public.charge_sale_fee_for_order(
    p_store_id,
    p_order_id,
    NULL,
    GREATEST(0, coalesce(p_commission_base_php, 0)),
    GREATEST(0, coalesce(p_fee_due_php, 0)),
    p_idempotency_key
  );

  IF coalesce(v_fee->>'ok', 'false') = 'true'
     AND coalesce((v_fee->>'idempotent')::boolean, false) IS NOT TRUE
     AND coalesce((v_fee->>'skipped')::boolean, false) IS NOT TRUE THEN
    UPDATE public.store_sale_fee_obligations
       SET charge_stage = p_charge_stage,
           fee_snapshot = p_fee_snapshot,
           original_fee_due_minor = fee_due_minor
     WHERE order_id = p_order_id;
  END IF;

  RETURN v_fee;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_store_commission_for_order(uuid, uuid, text, integer, integer, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_store_commission_for_order(uuid, uuid, text, integer, integer, jsonb, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- flag_store_commission_review — cancel/refund after charge → manual review
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.flag_store_commission_review(
  p_order_id uuid,
  p_trigger text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR p_trigger IS NULL OR p_trigger NOT IN ('cancelled', 'refunded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  UPDATE public.store_sale_fee_obligations
     SET adjustment_status = 'review_required',
         adjustment_trigger = p_trigger,
         review_flagged_at = now()
   WHERE order_id = p_order_id
     AND adjustment_status = 'none'
     AND status <> 'waived'
     AND fee_due_minor > 0
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'obligation_id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.flag_store_commission_review(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flag_store_commission_review(uuid, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- admin_resolve_store_commission_adjustment — the ONLY fee refund path
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_resolve_store_commission_adjustment(
  p_admin_user_id uuid,
  p_order_id uuid,
  p_decision text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ob public.store_sale_fee_obligations%ROWTYPE;
  v_order_status text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_rev jsonb;
  v_refunded bigint := 0;
  v_cancelled bigint := 0;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_required');
  END IF;
  IF p_order_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('refund', 'keep') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF v_note IS NULL OR char_length(v_note) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_required');
  END IF;

  SELECT * INTO v_ob
    FROM public.store_sale_fee_obligations
   WHERE order_id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'obligation_not_found');
  END IF;
  IF v_ob.adjustment_status IS DISTINCT FROM 'review_required' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_review', 'adjustment_status', v_ob.adjustment_status);
  END IF;

  SELECT order_status INTO v_order_status FROM public.store_orders WHERE id = p_order_id;
  IF v_order_status IS NULL OR v_order_status NOT IN ('cancelled', 'refunded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_closed', 'order_status', v_order_status);
  END IF;

  IF p_decision = 'refund' THEN
    v_rev := public.reverse_sale_fee_for_order(p_order_id, 'sale_fee_reversal:order:' || p_order_id::text);
    IF coalesce(v_rev->>'ok', 'false') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'store_commission_refund_failed:%', coalesce(v_rev->>'error', 'reverse_failed')
        USING ERRCODE = 'P0001';
    END IF;
    v_refunded := coalesce((v_rev->>'cash_credited_minor')::bigint, 0);
    v_cancelled := coalesce((v_rev->>'outstanding_cancelled_minor')::bigint, 0);
    UPDATE public.store_sale_fee_obligations
       SET adjustment_status = 'refunded',
           adjustment_note = v_note,
           adjusted_by = p_admin_user_id,
           adjusted_at = now(),
           adjustment_cash_refunded_minor = v_refunded,
           adjustment_outstanding_cancelled_minor = v_cancelled
     WHERE id = v_ob.id;
  ELSE
    UPDATE public.store_sale_fee_obligations
       SET adjustment_status = 'kept',
           adjustment_note = v_note,
           adjusted_by = p_admin_user_id,
           adjusted_at = now()
     WHERE id = v_ob.id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'obligation_id', v_ob.id,
    'decision', p_decision,
    'cash_refunded_minor', v_refunded,
    'outstanding_cancelled_minor', v_cancelled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_store_commission_adjustment(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_store_commission_adjustment(uuid, uuid, text, text)
  TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Backfill: already-closed orders whose fee was never reversed → review queue
-- (no money moves here; an admin decides each one).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.store_sale_fee_obligations ob
   SET adjustment_status = 'review_required',
       adjustment_trigger = o.order_status,
       review_flagged_at = now()
  FROM public.store_orders o
 WHERE o.id = ob.order_id
   AND o.order_status IN ('cancelled', 'refunded')
   AND ob.adjustment_status = 'none'
   AND ob.status <> 'waived'
   AND ob.fee_due_minor > 0;

COMMIT;
