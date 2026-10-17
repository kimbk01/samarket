-- DIBAY Store Commission × Business Cash SSOT
-- Doc: docs/store-commission-cash-settlement-ssot.md
--
-- Payment model: buyers pay the store directly (COD / store GCash / bank transfer).
-- The platform never holds payment_amount → no per-order payout to stores.
-- Platform commission is collected from the store's prepaid Business Cash.
--
-- A. Commission is charged INSIDE the store_orders status UPDATE transaction (trigger):
--    entering any cooking-or-later status (preparing, ready_for_pickup, delivering, arrived,
--    completed) charges once per order. No app path, admin tool, webhook or direct SQL
--    can move an order past 조리 시작 without the charge; a charge failure aborts the move.
-- B. Shortfall → open obligation; balance_minor stays >= 0; NET = balance − outstanding.
-- C. cancelled / refunded after a charge → review_required (same transaction). No auto refund.
-- D. Admin decision (approve full/partial | reject) is the ONLY commission refund path and is
--    recorded once, immutably, in store_commission_adjustments.
-- E. Order gate (admin_settings.store_cash_order_gate): NET <= 0 → new store_orders INSERT fails.
-- F. Financial history: obligations/adjustments can no longer be cascade-deleted with orders.
--
-- This migration moves NO money. Data changes are limited to:
--   * original_fee_due_minor backfill (from fee_due_minor, or from the immutable reversal ledger row)
--   * legacy automatic reversals recorded as `legacy_auto` adjustments (from ledger evidence only)
--   * already-closed orders with a live fee moved to the review queue

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 0. Privilege hardening — writes only through SECURITY DEFINER functions
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.store_sale_fee_obligations FROM anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.business_cash_ledger FROM anon, authenticated, service_role;
REVOKE TRUNCATE ON public.business_cash_accounts FROM anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. store_sale_fee_obligations — stage, frozen snapshot, review status, audit amount
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.store_sale_fee_obligations
  ADD COLUMN IF NOT EXISTS charge_stage text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS fee_snapshot jsonb NULL,
  ADD COLUMN IF NOT EXISTS adjustment_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS adjustment_trigger text NULL,
  ADD COLUMN IF NOT EXISTS review_flagged_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS original_fee_due_minor bigint NULL;

ALTER TABLE public.store_sale_fee_obligations
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_charge_stage_chk,
  ADD CONSTRAINT store_sale_fee_obligations_charge_stage_chk
    CHECK (charge_stage IN ('preparing', 'ready_for_pickup', 'delivering', 'arrived', 'completed')),
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_adjustment_status_chk,
  ADD CONSTRAINT store_sale_fee_obligations_adjustment_status_chk
    CHECK (adjustment_status IN ('none', 'review_required', 'refunded', 'kept')),
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_adjustment_trigger_chk,
  ADD CONSTRAINT store_sale_fee_obligations_adjustment_trigger_chk
    CHECK (adjustment_trigger IS NULL OR adjustment_trigger IN ('cancelled', 'refunded')),
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_original_chk,
  ADD CONSTRAINT store_sale_fee_obligations_original_chk
    CHECK (original_fee_due_minor IS NULL OR original_fee_due_minor >= fee_due_minor);

-- Financial history must survive order/store deletion attempts.
ALTER TABLE public.store_sale_fee_obligations
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_order_id_fkey,
  ADD CONSTRAINT store_sale_fee_obligations_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.store_orders (id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS store_sale_fee_obligations_store_id_fkey,
  ADD CONSTRAINT store_sale_fee_obligations_store_id_fkey
    FOREIGN KEY (store_id) REFERENCES public.stores (id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS store_sale_fee_obligations_review_idx
  ON public.store_sale_fee_obligations (review_flagged_at)
  WHERE adjustment_status = 'review_required';
CREATE INDEX IF NOT EXISTS store_sale_fee_obligations_store_created_idx
  ON public.store_sale_fee_obligations (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS business_cash_ledger_store_created_idx
  ON public.business_cash_ledger (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS business_cash_ledger_related_idx
  ON public.business_cash_ledger (related_type, related_id);

COMMENT ON COLUMN public.store_sale_fee_obligations.charge_stage IS
  'Order status that triggered the commission charge (first cooking-or-later status).';
COMMENT ON COLUMN public.store_sale_fee_obligations.original_fee_due_minor IS
  'Commission as charged. fee_due_minor shrinks on approved refunds; this never changes.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. store_commission_adjustments — one immutable decision per obligation
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.store_commission_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  obligation_id uuid NOT NULL REFERENCES public.store_sale_fee_obligations (id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.store_orders (id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approve', 'reject', 'legacy_auto')),
  -- legacy_other: a legacy automatic reversal on an order that is NOT cancelled/refunded
  -- (production evidence: QA scripts reversed fees of completed orders on 2026-09-01).
  trigger_status text NOT NULL CHECK (trigger_status IN ('cancelled', 'refunded', 'legacy_other')),
  fee_charged_minor bigint NOT NULL CHECK (fee_charged_minor >= 0),
  fee_paid_minor_before bigint NOT NULL CHECK (fee_paid_minor_before >= 0),
  fee_outstanding_minor_before bigint NOT NULL CHECK (fee_outstanding_minor_before >= 0),
  approved_minor bigint NOT NULL CHECK (approved_minor >= 0),
  cash_refund_minor bigint NOT NULL CHECK (cash_refund_minor >= 0),
  outstanding_cancel_minor bigint NOT NULL CHECK (outstanding_cancel_minor >= 0),
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 2),
  admin_user_id uuid NULL,
  cash_ledger_id uuid NULL REFERENCES public.business_cash_ledger (id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_commission_adjustments_one_per_obligation UNIQUE (obligation_id),
  CONSTRAINT store_commission_adjustments_idem_uq UNIQUE (idempotency_key),
  CONSTRAINT store_commission_adjustments_split_chk
    CHECK (approved_minor = cash_refund_minor + outstanding_cancel_minor),
  CONSTRAINT store_commission_adjustments_cash_le_paid_chk
    CHECK (cash_refund_minor <= fee_paid_minor_before),
  CONSTRAINT store_commission_adjustments_cancel_le_outstanding_chk
    CHECK (outstanding_cancel_minor <= fee_outstanding_minor_before),
  CONSTRAINT store_commission_adjustments_decision_amount_chk
    CHECK (
      (decision = 'reject' AND approved_minor = 0)
      OR (decision IN ('approve', 'legacy_auto') AND approved_minor > 0)
    ),
  CONSTRAINT store_commission_adjustments_admin_chk
    CHECK (decision = 'legacy_auto' OR admin_user_id IS NOT NULL),
  CONSTRAINT store_commission_adjustments_legacy_trigger_chk
    CHECK (trigger_status <> 'legacy_other' OR decision = 'legacy_auto'),
  CONSTRAINT store_commission_adjustments_ledger_chk
    CHECK ((cash_refund_minor > 0) = (cash_ledger_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS store_commission_adjustments_store_created_idx
  ON public.store_commission_adjustments (store_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.store_commission_adjustments_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'store_commission_adjustments_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS store_commission_adjustments_no_mutation ON public.store_commission_adjustments;
CREATE TRIGGER store_commission_adjustments_no_mutation
  BEFORE UPDATE OR DELETE ON public.store_commission_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.store_commission_adjustments_immutable();

ALTER TABLE public.store_commission_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_commission_adjustments_owner_select ON public.store_commission_adjustments;
CREATE POLICY store_commission_adjustments_owner_select
  ON public.store_commission_adjustments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_commission_adjustments.store_id AND s.owner_user_id = auth.uid())
    OR public.is_platform_admin(auth.uid())
  );
REVOKE ALL ON TABLE public.store_commission_adjustments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.store_commission_adjustments TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Backfill (evidence only, no money)
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE public.store_sale_fee_obligations
   SET original_fee_due_minor = fee_due_minor
 WHERE original_fee_due_minor IS NULL AND status <> 'waived';

-- Legacy automatic reversals (reverse_sale_fee_for_order) zeroed fee_due_minor; the immutable
-- reversal ledger row carries the reversed paid amount and the cancelled outstanding amount.
WITH ev AS (
  SELECT ob.id AS obligation_id, ob.order_id, ob.store_id, o.order_status,
         l.id AS ledger_id,
         coalesce((l.meta->>'fee_paid_minor_reversed')::bigint, 0) AS paid_rev,
         coalesce((l.meta->>'fee_outstanding_cancelled')::bigint, 0) AS out_cancel,
         l.created_at
    FROM public.store_sale_fee_obligations ob
    JOIN public.store_orders o ON o.id = ob.order_id
    JOIN public.business_cash_ledger l
      ON l.idempotency_key = 'sale_fee_reversal:order:' || ob.order_id::text
   WHERE ob.status = 'waived' AND ob.original_fee_due_minor IS NULL
)
INSERT INTO public.store_commission_adjustments (
  obligation_id, order_id, store_id, decision, trigger_status,
  fee_charged_minor, fee_paid_minor_before, fee_outstanding_minor_before,
  approved_minor, cash_refund_minor, outstanding_cancel_minor,
  reason, admin_user_id, cash_ledger_id, idempotency_key, created_at
)
SELECT obligation_id, order_id, store_id, 'legacy_auto',
       CASE WHEN order_status IN ('cancelled', 'refunded') THEN order_status ELSE 'legacy_other' END,
       paid_rev + out_cancel, paid_rev, out_cancel,
       paid_rev + out_cancel, paid_rev, out_cancel,
       'legacy automatic reversal (reverse_sale_fee_for_order) — recorded from ledger',
       NULL, CASE WHEN paid_rev > 0 THEN ledger_id END,
       'legacy_auto:' || obligation_id::text, created_at
  FROM ev
 WHERE paid_rev + out_cancel > 0
ON CONFLICT DO NOTHING;

UPDATE public.store_sale_fee_obligations ob
   SET original_fee_due_minor = a.fee_charged_minor,
       adjustment_status = 'refunded',
       adjustment_trigger = CASE WHEN a.trigger_status IN ('cancelled', 'refunded') THEN a.trigger_status END
  FROM public.store_commission_adjustments a
 WHERE a.obligation_id = ob.id AND a.decision = 'legacy_auto' AND ob.original_fee_due_minor IS NULL;

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Commission policy + calculation (SQL is the charge authority)
--    Mirrors lib/stores/store-fee-policy-resolve.ts precedence and calculator.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.store_commission_resolve_policy(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat uuid;
  v_topic uuid;
  v_row public.store_fee_policies%ROWTYPE;
  v_scope text;
BEGIN
  SELECT store_category_id, store_topic_id INTO v_cat, v_topic FROM public.stores WHERE id = p_store_id;

  SELECT * INTO v_row FROM public.store_fee_policies p
   WHERE p.is_active AND NOT coalesce(p.is_archived, false)
     AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
     AND p.store_id = p_store_id
   ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
  IF FOUND THEN v_scope := 'store'; END IF;

  IF v_scope IS NULL AND v_topic IS NOT NULL THEN
    SELECT * INTO v_row FROM public.store_fee_policies p
     WHERE p.is_active AND NOT coalesce(p.is_archived, false)
       AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
       AND p.store_id IS NULL AND p.topic_id = v_topic
     ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
    IF FOUND THEN v_scope := 'topic'; END IF;
  END IF;

  IF v_scope IS NULL AND v_cat IS NOT NULL THEN
    SELECT * INTO v_row FROM public.store_fee_policies p
     WHERE p.is_active AND NOT coalesce(p.is_archived, false)
       AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
       AND p.store_id IS NULL AND p.topic_id IS NULL AND p.category_id = v_cat
     ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
    IF FOUND THEN v_scope := 'category'; END IF;
  END IF;

  IF v_scope IS NULL THEN
    SELECT * INTO v_row FROM public.store_fee_policies p
     WHERE p.is_active AND NOT coalesce(p.is_archived, false)
       AND (p.starts_at IS NULL OR p.starts_at <= now()) AND (p.ends_at IS NULL OR p.ends_at > now())
       AND p.store_id IS NULL AND p.topic_id IS NULL AND p.category_id IS NULL
     ORDER BY p.priority ASC, p.starts_at DESC NULLS FIRST, p.created_at DESC LIMIT 1;
    IF FOUND THEN v_scope := 'default'; END IF;
  END IF;

  IF v_scope IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'policy_id', v_row.id,
    'policy_name', v_row.policy_name,
    'fee_percent', LEAST(100, GREATEST(0, coalesce(v_row.fee_percent, 0))),
    'fixed_fee', GREATEST(0, round(coalesce(v_row.fixed_fee, 0))),
    'delivery_fee_mode', coalesce(v_row.delivery_fee_mode, 'none'),
    'delivery_fee_percent', LEAST(100, GREATEST(0, coalesce(v_row.delivery_fee_percent, 0))),
    'scope', v_scope,
    'source', 'store_fee_policies',
    'raw', to_jsonb(v_row)
  );
END;
$$;

-- Internal Cash debit + obligation (no role gate; callers are gated).
CREATE OR REPLACE FUNCTION public.store_commission_debit_internal(
  p_store_id uuid,
  p_order_id uuid,
  p_settlement_id uuid,
  p_commission_base_php bigint,
  p_fee_due_minor bigint,
  p_idempotency_key text,
  p_charge_stage text,
  p_fee_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.store_sale_fee_obligations%ROWTYPE;
  v_cash_avail bigint := 0;
  v_cash_paid bigint := 0;
  v_outstanding bigint := 0;
  v_bc_bal bigint;
  v_ledger uuid;
  v_ob uuid;
BEGIN
  IF p_store_id IS NULL OR p_order_id IS NULL OR nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT * INTO v_existing FROM public.store_sale_fee_obligations
   WHERE idempotency_key = p_idempotency_key OR order_id = p_order_id
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'obligation_id', v_existing.id,
      'fee_due_minor', v_existing.fee_due_minor, 'fee_paid_minor', v_existing.fee_paid_minor,
      'fee_outstanding_minor', v_existing.fee_outstanding_minor
    );
  END IF;

  IF coalesce(p_fee_due_minor, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'fee_due_minor', 0);
  END IF;

  PERFORM public.ensure_business_cash_account(p_store_id);
  SELECT balance_minor INTO v_cash_avail FROM public.business_cash_accounts WHERE store_id = p_store_id FOR UPDATE;

  v_cash_paid := LEAST(GREATEST(coalesce(v_cash_avail, 0), 0), p_fee_due_minor);
  v_outstanding := p_fee_due_minor - v_cash_paid;

  INSERT INTO public.store_sale_fee_obligations (
    store_id, order_id, settlement_id, confirmed_revenue_php,
    fee_due_minor, fee_paid_minor, fee_outstanding_minor, status, idempotency_key, settled_at,
    charge_stage, fee_snapshot, original_fee_due_minor
  ) VALUES (
    p_store_id, p_order_id, p_settlement_id, GREATEST(0, coalesce(p_commission_base_php, 0))::integer,
    p_fee_due_minor, v_cash_paid, v_outstanding,
    CASE WHEN v_outstanding <= 0 THEN 'settled' ELSE 'open' END,
    p_idempotency_key,
    CASE WHEN v_outstanding <= 0 THEN now() ELSE NULL END,
    coalesce(p_charge_stage, 'completed'), p_fee_snapshot, p_fee_due_minor
  ) RETURNING id INTO v_ob;

  IF v_cash_paid > 0 THEN
    UPDATE public.business_cash_accounts
       SET balance_minor = balance_minor - v_cash_paid, updated_at = now()
     WHERE store_id = p_store_id
     RETURNING balance_minor INTO v_bc_bal;

    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, meta
    ) VALUES (
      p_store_id, 'SALE_FEE', 'debit', v_cash_paid, v_bc_bal,
      'store_order', p_order_id::text, p_idempotency_key || ':cash', 'system',
      jsonb_build_object('order_id', p_order_id, 'obligation_id', v_ob, 'settlement_id', p_settlement_id,
                         'confirmed_revenue_php', p_commission_base_php, 'charge_stage', p_charge_stage,
                         'fee_due_minor', p_fee_due_minor, 'fee_outstanding_minor', v_outstanding)
    ) RETURNING id INTO v_ledger;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'obligation_id', v_ob,
    'fee_due_minor', p_fee_due_minor, 'fee_paid_minor', v_cash_paid,
    'fee_outstanding_minor', v_outstanding, 'cash_ledger_id', v_ledger
  );
END;
$$;

-- Existing service_role entry point keeps its signature; it now uses the shared internal writer.
CREATE OR REPLACE FUNCTION public.charge_sale_fee_for_order(
  p_store_id uuid,
  p_order_id uuid,
  p_settlement_id uuid,
  p_confirmed_revenue_php integer,
  p_fee_due_php integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  RETURN public.store_commission_debit_internal(
    p_store_id, p_order_id, p_settlement_id, p_confirmed_revenue_php,
    GREATEST(0, coalesce(p_fee_due_php, 0))::bigint * 100,
    nullif(btrim(coalesce(p_idempotency_key, '')), ''), 'completed', NULL
  );
END;
$$;

-- Commission charge for one order (policy + calculator + debit). Idempotent per order.
CREATE OR REPLACE FUNCTION public.store_commission_charge_order_internal(p_order_id uuid, p_stage text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_existing uuid;
  v_policy jsonb;
  v_base bigint;
  v_delivery bigint;
  v_pct numeric;
  v_fixed bigint;
  v_percent_fee bigint;
  v_platform bigint;
  v_delivery_income bigint := 0;
  v_fee_php bigint;
BEGIN
  SELECT id INTO v_existing FROM public.store_sale_fee_obligations WHERE order_id = p_order_id;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'obligation_id', v_existing);
  END IF;

  SELECT id, store_id, payment_amount, gift_redemption_amount, platform_funded_amount, delivery_fee_amount
    INTO v_order FROM public.store_orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  v_base := GREATEST(0, trunc(coalesce(v_order.payment_amount, 0)))::bigint
          + GREATEST(0, trunc(coalesce(v_order.gift_redemption_amount, 0)))::bigint
          + GREATEST(0, trunc(coalesce(v_order.platform_funded_amount, 0)))::bigint;
  IF v_base <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'reason', 'zero_base');
  END IF;

  v_policy := public.store_commission_resolve_policy(v_order.store_id);
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'store_commission_policy_missing store=%', v_order.store_id USING ERRCODE = 'P0001';
  END IF;

  v_delivery := GREATEST(0, trunc(coalesce(v_order.delivery_fee_amount, 0)))::bigint;
  v_pct := (v_policy->>'fee_percent')::numeric;
  v_fixed := (v_policy->>'fixed_fee')::bigint;
  v_percent_fee := LEAST(v_base, floor(v_base * v_pct / 100))::bigint;
  v_platform := LEAST(v_base, v_percent_fee + v_fixed);
  IF v_policy->>'delivery_fee_mode' = 'percent' THEN
    v_delivery_income := LEAST(v_delivery, floor(v_delivery * (v_policy->>'delivery_fee_percent')::numeric / 100))::bigint;
  END IF;
  v_fee_php := v_platform + v_delivery_income;

  RETURN public.store_commission_debit_internal(
    v_order.store_id, p_order_id, NULL, v_base, v_fee_php * 100,
    'sale_fee:order:' || p_order_id::text, p_stage,
    jsonb_build_object(
      'policy_id', v_policy->'policy_id',
      'policy', v_policy - 'policy_id',
      'commission_base_php', v_base,
      'delivery_fee_php', v_delivery,
      'fee_percent', v_pct,
      'platform_fee_php', v_percent_fee,
      'fixed_fee_php', v_platform - v_percent_fee,
      'delivery_income_php', v_delivery_income,
      'fee_due_php', v_fee_php,
      'charged_on_status', p_stage
    )
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4b. Admin financial notifications — exceptions only (reuses R13 admin_notification_outbox)
--     Normal orders / cooking-start charge / completion / top-ups never notify.
--     One outbox row per financial event (source_key UNIQUE) → retries never duplicate.
--     Work status is NOT stored on the notification: the inbox reads the live review queue.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.store_commission_php_text(p_minor bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '₱' || to_char(coalesce(p_minor, 0) / 100.0, 'FM999,999,999,990.00');
$$;

CREATE OR REPLACE FUNCTION public.store_commission_notify_admin(
  p_source_key text,
  p_kind text,
  p_severity text,
  p_title text,
  p_body text,
  p_link text,
  p_work_table text,
  p_work_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regprocedure('public.admin_notification_outbox_enqueue(text,text,jsonb,text)') IS NULL THEN
    RETURN false;
  END IF;
  -- Best effort inside the caller's transaction: a notification failure must never block the
  -- order status change (the review queue row itself is the durable record; the scan replays it).
  BEGIN
    -- Go-live baseline (section 12 only): financial exceptions that already exist when alerts go live
    -- are recorded under their source_key as handled ('delivered', payload.baseline) — never pushed to
    -- admins, and the same event can never alert later. They stay visible on the 금융 예외 tab.
    -- delivered_at stays NULL: no send happened, so delivery history is not inflated.
    IF p_kind = 'settlement_financial_exception'
       AND current_setting('dibay.settlement_alert_baseline', true) = 'on' THEN
      INSERT INTO public.admin_notification_outbox (source_key, kind, payload, status, delivered_at, last_error)
      VALUES (p_source_key, p_kind,
              jsonb_build_object('baseline', true, 'title', p_title, 'body', p_body, 'linkUrl', p_link),
              'delivered', NULL, 'baseline_preexisting')
      ON CONFLICT (source_key) DO NOTHING;
      RETURN false;
    END IF;
    RETURN public.admin_notification_outbox_enqueue(
      p_source_key,
      p_kind,
      jsonb_build_object(
        'broadcastPermission', 'business',
        'requiredPermission', 'business',
        'kind', p_kind,
        'severity', p_severity,
        'title', p_title,
        'body', p_body,
        'linkUrl', p_link,
        'workRef', CASE WHEN p_work_id IS NULL THEN NULL ELSE jsonb_build_object('table', p_work_table, 'id', p_work_id) END,
        'dedupeKey', p_source_key,
        'push', true
      ),
      NULL
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'store_commission_notify_admin failed: % (%)', SQLERRM, p_source_key;
    RETURN false;
  END;
END;
$$;

-- Status change refused because the commission could not be charged (e.g. no fee policy).
-- Called by the app after the rolled-back UPDATE (the trigger transaction itself is gone).
CREATE OR REPLACE FUNCTION public.store_commission_notify_charge_failure(p_order_id uuid, p_target_status text, p_error text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
BEGIN
  SELECT o.id, o.order_no, o.store_id, o.order_status, s.store_name INTO v
    FROM public.store_orders o JOIN public.stores s ON s.id = o.store_id WHERE o.id = p_order_id;
  -- Only a refused (rolled-back) transition is a failure: if the order is in the target status, no alert.
  IF NOT FOUND OR v.order_status IS NOT DISTINCT FROM p_target_status THEN
    RETURN false;
  END IF;
  RETURN public.store_commission_notify_admin(
    'settlement_exception:charge_failed:' || v.id::text || ':' || coalesce(p_target_status, ''),
    'settlement_financial_exception',
    'critical',
    '[수수료 부과 실패] ' || coalesce(v.store_name, '') || ' · #' || coalesce(v.order_no, v.id::text),
    '주문 상태 변경(' || coalesce(p_target_status, '') || ')이 거부됨 · ' || left(coalesce(p_error, 'unknown'), 120)
      || ' · 매장 수수료 정책 확인 필요',
    '/admin/store-settlements?tab=exceptions&store_id=' || v.store_id::text,
    'store_orders',
    v.id::text
  );
END;
$$;

-- Cancel / refund after cooking → exactly one "commission review" alert per obligation.
CREATE OR REPLACE FUNCTION public.store_commission_notify_review(p_obligation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
BEGIN
  SELECT ob.id, ob.order_id, ob.fee_paid_minor, ob.fee_outstanding_minor, ob.adjustment_trigger,
         coalesce(ob.original_fee_due_minor, ob.fee_due_minor) AS charged,
         o.order_no, s.store_name
    INTO v
    FROM public.store_sale_fee_obligations ob
    JOIN public.store_orders o ON o.id = ob.order_id
    JOIN public.stores s ON s.id = ob.store_id
   WHERE ob.id = p_obligation_id AND ob.adjustment_status = 'review_required';
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN public.store_commission_notify_admin(
    'settlement_review:' || v.id::text,
    'settlement_commission_review',
    'warning',
    '[취소·환불 수수료 검토] ' || coalesce(v.store_name, '') || ' · #' || coalesce(v.order_no, v.order_id::text),
    CASE WHEN v.adjustment_trigger = 'refunded' THEN '환불' ELSE '조리 후 취소' END
      || ' · 부과 ' || public.store_commission_php_text(v.charged)
      || ' (캐시 차감 ' || public.store_commission_php_text(v.fee_paid_minor)
      || ' · 미납 ' || public.store_commission_php_text(v.fee_outstanding_minor) || ') · 환급 승인·거절 검토 대상',
    '/admin/store-settlements?tab=ledger&order_no=' || coalesce(v.order_no, '') || '&open=' || v.id::text,
    'store_sale_fee_obligations',
    v.id::text
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Lifecycle trigger — charge / review flag inside the status transaction
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.store_orders_commission_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_flagged uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.order_status IS NOT DISTINCT FROM OLD.order_status THEN
    RETURN NULL;
  END IF;

  IF NEW.order_status IN ('preparing', 'ready_for_pickup', 'delivering', 'arrived', 'completed') THEN
    v_res := public.store_commission_charge_order_internal(NEW.id, NEW.order_status);
    IF coalesce(v_res->>'ok', 'false') IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'store_commission_charge_failed:%', coalesce(v_res->>'error', 'unknown')
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF NEW.order_status IN ('cancelled', 'refunded') THEN
    UPDATE public.store_sale_fee_obligations
       SET adjustment_status = 'review_required',
           adjustment_trigger = NEW.order_status,
           review_flagged_at = now()
     WHERE order_id = NEW.id
       AND adjustment_status = 'none'
       AND status <> 'waived'
       AND fee_due_minor > 0
    RETURNING id INTO v_flagged;
    -- Admin alert only when a review was actually opened (a charged order cancelled/refunded).
    IF v_flagged IS NOT NULL THEN
      PERFORM public.store_commission_notify_review(v_flagged);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_orders_commission_lifecycle ON public.store_orders;
CREATE TRIGGER trg_store_orders_commission_lifecycle
  AFTER INSERT OR UPDATE OF order_status ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_commission_lifecycle();

-- Kept for reconcile write path (legacy rows); the trigger is the runtime authority.
CREATE OR REPLACE FUNCTION public.flag_store_commission_review(p_order_id uuid, p_trigger text)
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
  UPDATE public.store_sale_fee_obligations ob
     SET adjustment_status = 'review_required', adjustment_trigger = p_trigger, review_flagged_at = now()
    FROM public.store_orders o
   WHERE ob.order_id = p_order_id AND o.id = ob.order_id AND o.order_status = p_trigger
     AND ob.adjustment_status = 'none' AND ob.status <> 'waived' AND ob.fee_due_minor > 0
  RETURNING ob.id INTO v_id;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;
  PERFORM public.store_commission_notify_review(v_id);
  RETURN jsonb_build_object('ok', true, 'obligation_id', v_id);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Admin decision — the ONLY commission refund path
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_decide_store_commission_adjustment(
  p_admin_user_id uuid,
  p_order_id uuid,
  p_decision text,
  p_approved_minor bigint,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_prev public.store_commission_adjustments%ROWTYPE;
  v_store uuid;
  v_ob public.store_sale_fee_obligations%ROWTYPE;
  v_order_status text;
  v_total bigint;
  v_approved bigint := 0;
  v_cancel bigint := 0;
  v_refund bigint := 0;
  v_bal bigint;
  v_ledger uuid;
  v_adj uuid := gen_random_uuid();
  v_new_due bigint;
  v_new_out bigint;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR NOT public.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'admin_required');
  END IF;
  IF p_order_id IS NULL OR v_key IS NULL OR p_decision IS NULL OR p_decision NOT IN ('approve', 'reject') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  -- Replay of the same request (double click / retry) returns the recorded decision.
  SELECT * INTO v_prev FROM public.store_commission_adjustments WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_prev.order_id IS DISTINCT FROM p_order_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'adjustment_id', v_prev.id,
      'decision', v_prev.decision, 'approved_minor', v_prev.approved_minor,
      'cash_refund_minor', v_prev.cash_refund_minor, 'outstanding_cancel_minor', v_prev.outstanding_cancel_minor);
  END IF;

  SELECT store_id INTO v_store FROM public.store_sale_fee_obligations WHERE order_id = p_order_id;
  IF v_store IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'obligation_not_found');
  END IF;

  -- Lock order: cash account → obligation (same as charge / settle).
  PERFORM public.ensure_business_cash_account(v_store);
  PERFORM 1 FROM public.business_cash_accounts WHERE store_id = v_store FOR UPDATE;
  SELECT * INTO v_ob FROM public.store_sale_fee_obligations WHERE order_id = p_order_id FOR UPDATE;

  IF v_ob.adjustment_status IS DISTINCT FROM 'review_required' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_review', 'adjustment_status', v_ob.adjustment_status);
  END IF;
  SELECT order_status INTO v_order_status FROM public.store_orders WHERE id = p_order_id;
  IF v_order_status IS NULL OR v_order_status NOT IN ('cancelled', 'refunded') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_closed', 'order_status', v_order_status);
  END IF;

  v_total := v_ob.fee_paid_minor + v_ob.fee_outstanding_minor;
  IF p_decision = 'approve' THEN
    v_approved := coalesce(p_approved_minor, v_total);
    IF v_approved <= 0 OR v_approved > v_total THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount', 'max_minor', v_total);
    END IF;
    -- Unpaid commission is cancelled first; Cash is refunded only for what was actually paid.
    v_cancel := LEAST(v_approved, v_ob.fee_outstanding_minor);
    v_refund := v_approved - v_cancel;
  END IF;

  IF v_refund > 0 THEN
    UPDATE public.business_cash_accounts
       SET balance_minor = balance_minor + v_refund, updated_at = now()
     WHERE store_id = v_store
     RETURNING balance_minor INTO v_bal;
    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, actor_user_id, meta
    ) VALUES (
      v_store, 'SALE_FEE_REVERSAL', 'credit', v_refund, v_bal,
      'store_commission_adjustment', v_adj::text, 'commission_adj:' || v_adj::text, 'admin', p_admin_user_id,
      jsonb_build_object('order_id', p_order_id, 'obligation_id', v_ob.id, 'adjustment_id', v_adj,
                         'approved_minor', v_approved, 'outstanding_cancel_minor', v_cancel)
    ) RETURNING id INTO v_ledger;
  END IF;

  v_new_due := v_ob.fee_due_minor - v_approved;
  v_new_out := v_ob.fee_outstanding_minor - v_cancel;
  UPDATE public.store_sale_fee_obligations
     SET fee_due_minor = v_new_due,
         fee_paid_minor = fee_paid_minor - v_refund,
         fee_outstanding_minor = v_new_out,
         status = CASE WHEN v_new_due = 0 THEN 'waived' WHEN v_new_out = 0 THEN 'settled' ELSE 'open' END,
         settled_at = CASE WHEN v_new_out = 0 THEN coalesce(settled_at, now()) ELSE settled_at END,
         adjustment_status = CASE WHEN p_decision = 'approve' THEN 'refunded' ELSE 'kept' END
   WHERE id = v_ob.id;

  INSERT INTO public.store_commission_adjustments (
    id, obligation_id, order_id, store_id, decision, trigger_status,
    fee_charged_minor, fee_paid_minor_before, fee_outstanding_minor_before,
    approved_minor, cash_refund_minor, outstanding_cancel_minor,
    reason, admin_user_id, cash_ledger_id, idempotency_key
  ) VALUES (
    v_adj, v_ob.id, p_order_id, v_store, p_decision, v_order_status,
    coalesce(v_ob.original_fee_due_minor, v_ob.fee_due_minor), v_ob.fee_paid_minor, v_ob.fee_outstanding_minor,
    v_approved, v_refund, v_cancel,
    v_reason, p_admin_user_id, v_ledger, v_key
  );

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'adjustment_id', v_adj, 'decision', p_decision,
    'approved_minor', v_approved, 'cash_refund_minor', v_refund, 'outstanding_cancel_minor', v_cancel,
    'cash_ledger_id', v_ledger
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Order gate (NET <= 0 → no new orders)
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
  SELECT coalesce(balance_minor, 0) INTO v_balance FROM public.business_cash_accounts WHERE store_id = p_store_id;
  SELECT coalesce(sum(fee_outstanding_minor), 0) INTO v_outstanding
    FROM public.store_sale_fee_obligations WHERE store_id = p_store_id AND status = 'open';
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
      USING ERRCODE = 'P0001', DETAIL = 'net_minor=' || coalesce(v_pos->>'net_minor', '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_orders_cash_order_gate ON public.store_orders;
CREATE TRIGGER trg_store_orders_cash_order_gate
  BEFORE INSERT ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.store_orders_enforce_cash_order_gate();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Read SSOT — one server computation for Admin and Owner (no row caps on totals)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.store_commission_ledger_page(
  p_store_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_state text,
  p_order_no text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT ob.*, o.order_no, o.order_status, o.buyer_payment_method, s.store_name,
           a.id AS adj_id, a.decision AS adj_decision, a.approved_minor AS adj_approved,
           a.cash_refund_minor AS adj_cash, a.outstanding_cancel_minor AS adj_cancel,
           a.reason AS adj_reason, a.admin_user_id AS adj_admin, a.created_at AS adj_at,
           coalesce(ob.original_fee_due_minor, ob.fee_due_minor + coalesce(a.approved_minor, 0)) AS fee_charged,
           -- Debt first: a partially refunded or rejected row that still owes shows as outstanding.
           CASE
             WHEN ob.adjustment_status = 'review_required' THEN 'review_required'
             WHEN ob.fee_outstanding_minor > 0 THEN 'outstanding'
             WHEN ob.adjustment_status = 'refunded' OR ob.status = 'waived' THEN 'refunded'
             WHEN ob.adjustment_status = 'kept' THEN 'kept'
             ELSE 'charged'
           END AS state
      FROM public.store_sale_fee_obligations ob
      JOIN public.store_orders o ON o.id = ob.order_id
      JOIN public.stores s ON s.id = ob.store_id
      LEFT JOIN public.store_commission_adjustments a ON a.obligation_id = ob.id
     WHERE (p_store_ids IS NULL OR ob.store_id = ANY (p_store_ids))
       AND (p_from IS NULL OR ob.created_at >= p_from)
       AND (p_to IS NULL OR ob.created_at < p_to)
       AND (nullif(btrim(coalesce(p_order_no, '')), '') IS NULL OR o.order_no ILIKE '%' || btrim(p_order_no) || '%')
  ),
  filtered AS (
    SELECT * FROM base
     WHERE p_state IS NULL OR p_state = 'all' OR state = p_state
        OR (p_state = 'decided' AND adj_id IS NOT NULL)
        -- decision-based views (a rejected row can still carry unpaid fee → state 'outstanding')
        OR (p_state = 'approved' AND adj_decision IN ('approve', 'legacy_auto'))
        OR (p_state = 'rejected' AND adj_decision = 'reject')
  ),
  sums AS (
    SELECT count(*) AS n,
           coalesce(sum(confirmed_revenue_php), 0) AS base_php,
           coalesce(sum(fee_charged), 0) AS charged,
           coalesce(sum(fee_paid_minor), 0) AS paid,
           coalesce(sum(fee_outstanding_minor), 0) AS outstanding,
           coalesce(sum(adj_cash), 0) AS refunded,
           coalesce(sum(adj_cancel), 0) AS cancelled,
           count(*) FILTER (WHERE state = 'review_required') AS review_n,
           coalesce(sum(fee_charged) FILTER (WHERE state = 'review_required'), 0) AS review_fee
      FROM filtered
  )
  SELECT jsonb_build_object(
    'total', (SELECT n FROM sums),
    'summary', (
      SELECT jsonb_build_object(
        'count', n,
        'commission_base_php', base_php,
        'fee_charged_minor', charged,
        'fee_paid_minor', paid,
        'fee_outstanding_minor', outstanding,
        'cash_refunded_minor', refunded,
        'outstanding_cancelled_minor', cancelled,
        'net_commission_minor', charged - refunded - cancelled,
        'review_count', review_n,
        'review_fee_minor', review_fee,
        'reconciles', charged = paid + outstanding + refunded + cancelled
      ) FROM sums
    ),
    'rows', coalesce((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC, r.id) FROM (
        SELECT id, store_id, store_name, order_id, order_no, order_status, buyer_payment_method,
               charge_stage, created_at, confirmed_revenue_php, fee_snapshot, fee_charged,
               fee_paid_minor, fee_outstanding_minor, status, adjustment_status, adjustment_trigger,
               review_flagged_at, state, adj_id, adj_decision, adj_approved, adj_cash, adj_cancel,
               adj_reason, adj_admin, adj_at
          FROM filtered
         ORDER BY created_at DESC, id
         LIMIT LEAST(500, GREATEST(1, coalesce(p_limit, 100)))
        OFFSET GREATEST(0, coalesce(p_offset, 0))
      ) r
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.store_cash_ledger_page(
  p_store_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_kinds text[],
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Opening/closing are ledger sums (order-independent: rows written in one transaction share
  -- created_at, so "last balance_after" is ambiguous). `ledger_reconciles` says whether the
  -- ledger sum equals the live account balance for the selected stores.
  WITH opening AS (
    SELECT coalesce(sum(CASE WHEN direction = 'credit' THEN amount_minor ELSE -amount_minor END), 0) AS v
      FROM public.business_cash_ledger
     WHERE (p_store_ids IS NULL OR store_id = ANY (p_store_ids))
       AND p_from IS NOT NULL AND created_at < p_from
  ),
  closing AS (
    SELECT coalesce(sum(CASE WHEN direction = 'credit' THEN amount_minor ELSE -amount_minor END), 0) AS v
      FROM public.business_cash_ledger
     WHERE (p_store_ids IS NULL OR store_id = ANY (p_store_ids))
       AND (p_to IS NULL OR created_at < p_to)
  ),
  recon AS (
    SELECT coalesce(jsonb_agg(a.store_id) FILTER (
             WHERE a.balance_minor <> coalesce((
               SELECT sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END)
                 FROM public.business_cash_ledger l WHERE l.store_id = a.store_id), 0)), '[]'::jsonb) AS mismatched
      FROM public.business_cash_accounts a
     WHERE p_store_ids IS NULL OR a.store_id = ANY (p_store_ids)
  ),
  period AS (
    SELECT l.* FROM public.business_cash_ledger l
     WHERE (p_store_ids IS NULL OR l.store_id = ANY (p_store_ids))
       AND (p_from IS NULL OR l.created_at >= p_from)
       AND (p_to IS NULL OR l.created_at < p_to)
  ),
  filtered AS (
    SELECT * FROM period WHERE p_kinds IS NULL OR entry_kind = ANY (p_kinds)
  )
  SELECT jsonb_build_object(
    'opening_minor', (SELECT v FROM opening),
    'closing_minor', (SELECT v FROM closing),
    'ledger_mismatch_store_ids', (SELECT mismatched FROM recon),
    'credit_minor', (SELECT coalesce(sum(amount_minor) FILTER (WHERE direction = 'credit'), 0) FROM period),
    'debit_minor', (SELECT coalesce(sum(amount_minor) FILTER (WHERE direction = 'debit'), 0) FROM period),
    'by_kind', coalesce((SELECT jsonb_object_agg(entry_kind, total) FROM (
        SELECT entry_kind, sum(CASE WHEN direction = 'credit' THEN amount_minor ELSE -amount_minor END) AS total
          FROM period GROUP BY entry_kind) k), '{}'::jsonb),
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC, r.id DESC) FROM (
        SELECT f.id, f.store_id, s.store_name, f.entry_kind, f.direction, f.amount_minor,
               f.balance_after_minor, f.related_type, f.related_id, f.actor_type, f.created_at,
               f.meta->>'order_id' AS order_id
          FROM filtered f JOIN public.stores s ON s.id = f.store_id
         ORDER BY f.created_at DESC, f.id DESC
         LIMIT LEAST(500, GREATEST(1, coalesce(p_limit, 100)))
        OFFSET GREATEST(0, coalesce(p_offset, 0))
      ) r
    ), '[]'::jsonb)
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8b. Breakdown (day / month in Asia/Manila, or store) — same rows as the ledger page
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.store_commission_breakdown(
  p_store_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_group text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT ob.store_id, s.store_name, ob.created_at,
           coalesce(ob.original_fee_due_minor, ob.fee_due_minor + coalesce(a.approved_minor, 0)) AS charged,
           ob.fee_paid_minor AS paid, ob.fee_outstanding_minor AS outstanding,
           coalesce(a.cash_refund_minor, 0) AS refunded, coalesce(a.outstanding_cancel_minor, 0) AS cancelled,
           ob.confirmed_revenue_php AS base_php,
           CASE coalesce(p_group, 'day')
             WHEN 'month' THEN to_char(ob.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM')
             WHEN 'store' THEN ob.store_id::text
             ELSE to_char(ob.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD')
           END AS bucket
      FROM public.store_sale_fee_obligations ob
      JOIN public.stores s ON s.id = ob.store_id
      LEFT JOIN public.store_commission_adjustments a ON a.obligation_id = ob.id
     WHERE (p_store_ids IS NULL OR ob.store_id = ANY (p_store_ids))
       AND (p_from IS NULL OR ob.created_at >= p_from)
       AND (p_to IS NULL OR ob.created_at < p_to)
  )
  SELECT coalesce(jsonb_agg(b ORDER BY b.bucket DESC), '[]'::jsonb) FROM (
    SELECT bucket,
           max(store_name) FILTER (WHERE coalesce(p_group, 'day') = 'store') AS label,
           count(*) AS count, sum(base_php) AS commission_base_php,
           sum(charged) AS fee_charged_minor, sum(paid) AS fee_paid_minor,
           sum(outstanding) AS fee_outstanding_minor, sum(refunded) AS cash_refunded_minor,
           sum(cancelled) AS outstanding_cancelled_minor,
           sum(charged) - sum(refunded) - sum(cancelled) AS net_commission_minor
      FROM base GROUP BY bucket
  ) b;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8c. Platform payout obligation — classification of completed orders (read-only).
--     Buyers pay the store directly; the platform owes the store ONLY the amount it
--     actually holds (gift certificate redemption + platform-funded coupon).
--     Legacy store_settlements 'scheduled/processing/held' amounts are NOT payouts.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.store_platform_payable_page(
  p_store_ids uuid[],
  p_from timestamptz,
  p_to timestamptz,
  p_view text,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT o.id AS order_id, o.order_no, o.store_id, s.store_name, o.created_at, o.buyer_payment_method,
           GREATEST(0, trunc(coalesce(o.payment_amount, 0)))::bigint AS direct_php,
           (GREATEST(0, trunc(coalesce(o.gift_redemption_amount, 0)))
            + GREATEST(0, trunc(coalesce(o.platform_funded_amount, 0))))::bigint AS held_php,
           coalesce((SELECT e.amount FROM public.store_economic_point_ledger e
                      WHERE e.idempotency_key = 'sale_coin:' || o.id::text), 0)::bigint AS coin_minted,
           -- Gift redemptions with a live gift_certificate_redemptions row are owed on the gift
           -- revenue rail (gift_certificate_revenue_ledger → conversion / cash-out), never here.
           LEAST(GREATEST(0, trunc(coalesce(o.gift_redemption_amount, 0)))::bigint,
                 coalesce((SELECT sum(r.redeemed_amount) FROM public.gift_certificate_redemptions r
                            WHERE r.order_id = o.id AND NOT coalesce(r.reversed, false)), 0)::bigint) AS gift_rail_php,
           coalesce((SELECT sum(r.merchant_net_amount) FROM public.gift_certificate_redemptions r
                      WHERE r.order_id = o.id AND NOT coalesce(r.reversed, false)), 0)::bigint AS gift_rail_net_php,
           st.settlement_status, coalesce(st.net_settlement_amount, st.settlement_amount, 0)::bigint AS legacy_net_php
      FROM public.store_orders o
      JOIN public.stores s ON s.id = o.store_id
      LEFT JOIN public.store_settlements st ON st.order_id = o.id
     WHERE o.order_status = 'completed'
       AND (p_store_ids IS NULL OR o.store_id = ANY (p_store_ids))
       AND (p_from IS NULL OR o.created_at >= p_from)
       AND (p_to IS NULL OR o.created_at < p_to)
  ),
  resid AS (
    SELECT *, held_php - gift_rail_php AS rail_free_held_php FROM base
  ),
  cls AS (
    SELECT *,
           LEAST(rail_free_held_php, coin_minted) AS held_paid_by_coin_php,
           rail_free_held_php - LEAST(rail_free_held_php, coin_minted) AS payable_php,
           -- Coin above the platform-held money not already owed on the gift rail (incl. gift paid twice).
           GREATEST(0, coin_minted - rail_free_held_php) AS coin_over_credit,
           CASE
             WHEN rail_free_held_php - LEAST(rail_free_held_php, coin_minted) > 0 THEN 'payable'
             WHEN gift_rail_php > 0 THEN 'gift_rail'
             WHEN settlement_status = 'paid' THEN 'legacy_manual_paid'
             ELSE 'direct_collected'
           END AS class
      FROM resid
  ),
  filtered AS (
    -- payable: what this rail owes (+ legacy manual payouts to review); exceptions: financial
    -- anomalies (Coin above platform-held money, legacy manual payouts); all: every completed order.
    SELECT * FROM cls
     WHERE CASE coalesce(p_view, 'payable')
             WHEN 'all' THEN true
             WHEN 'exceptions' THEN coin_over_credit > 0 OR class = 'legacy_manual_paid'
             ELSE class IN ('payable', 'legacy_manual_paid')
           END
  )
  SELECT jsonb_build_object(
    'summary', (SELECT jsonb_build_object(
        'orders', count(*),
        'direct_collected_php', coalesce(sum(direct_php), 0),
        'platform_held_php', coalesce(sum(held_php), 0),
        'held_paid_by_coin_php', coalesce(sum(held_paid_by_coin_php), 0),
        'gift_rail_php', coalesce(sum(gift_rail_php), 0),
        'gift_rail_net_php', coalesce(sum(gift_rail_net_php), 0),
        'gift_rail_orders', count(*) FILTER (WHERE gift_rail_php > 0),
        'payable_php', coalesce(sum(payable_php), 0),
        'payable_orders', count(*) FILTER (WHERE payable_php > 0),
        'coin_over_credit', coalesce(sum(coin_over_credit), 0),
        'legacy_open_settlement_php', coalesce(sum(legacy_net_php) FILTER (WHERE settlement_status IN ('scheduled', 'processing', 'held')), 0),
        'legacy_open_settlement_count', count(*) FILTER (WHERE settlement_status IN ('scheduled', 'processing', 'held')),
        'legacy_manual_paid_php', coalesce(sum(legacy_net_php) FILTER (WHERE settlement_status = 'paid'), 0),
        'legacy_manual_paid_count', count(*) FILTER (WHERE settlement_status = 'paid')
      ) FROM cls),
    'total', (SELECT count(*) FROM filtered),
    'rows', coalesce((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC, r.order_id) FROM (
        SELECT order_id, order_no, store_id, store_name, created_at, buyer_payment_method, direct_php, held_php,
               coin_minted, gift_rail_php, held_paid_by_coin_php, payable_php, coin_over_credit, settlement_status, legacy_net_php, class
          FROM filtered
         ORDER BY created_at DESC, order_id
         LIMIT LEAST(500, GREATEST(1, coalesce(p_limit, 100)))
        OFFSET GREATEST(0, coalesce(p_offset, 0))
      ) r
    ), '[]'::jsonb)
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Integrity report — invariants over the real ledgers (read-only)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.store_commission_integrity_report(p_store_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ob AS (
    SELECT * FROM public.store_sale_fee_obligations
     WHERE p_store_ids IS NULL OR store_id = ANY (p_store_ids)
  ),
  i1 AS (  -- charged = remaining due + approved adjustments
    SELECT ob.id FROM ob LEFT JOIN public.store_commission_adjustments a ON a.obligation_id = ob.id
     WHERE ob.original_fee_due_minor IS NOT NULL
       AND ob.original_fee_due_minor <> ob.fee_due_minor + coalesce(a.approved_minor, 0)
  ),
  i2 AS (  -- Cash actually taken for the order = fee_paid_minor
    SELECT ob.id FROM ob
     WHERE ob.fee_paid_minor <> (
       coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE' AND l.related_type = 'store_order' AND l.related_id = ob.order_id::text), 0)
     + coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE_SETTLEMENT' AND l.related_id = ob.id::text), 0)
     - coalesce((SELECT sum(l.amount_minor) FROM public.business_cash_ledger l
                  WHERE l.entry_kind = 'SALE_FEE_REVERSAL'
                    AND (l.related_id = ob.order_id::text
                         OR l.related_id IN (SELECT a.id::text FROM public.store_commission_adjustments a WHERE a.obligation_id = ob.id))), 0))
  ),
  i3 AS (  -- status matches amounts
    SELECT ob.id FROM ob
     WHERE (ob.status = 'open' AND ob.fee_outstanding_minor = 0)
        OR (ob.status = 'settled' AND ob.fee_outstanding_minor <> 0)
        OR (ob.status = 'waived' AND ob.fee_due_minor <> 0)
  ),
  i4 AS (  -- closed order with a live fee must be in review or decided
    SELECT ob.id FROM ob JOIN public.store_orders o ON o.id = ob.order_id
     WHERE o.order_status IN ('cancelled', 'refunded') AND ob.adjustment_status = 'none'
       AND ob.status <> 'waived' AND ob.fee_due_minor > 0
  ),
  acct AS (
    SELECT a.store_id, a.balance_minor,
           (SELECT coalesce(sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END), 0)
              FROM public.business_cash_ledger l WHERE l.store_id = a.store_id) AS ledger_sum
      FROM public.business_cash_accounts a
     WHERE p_store_ids IS NULL OR a.store_id = ANY (p_store_ids)
  ),
  i6 AS (SELECT store_id FROM acct WHERE balance_minor <> ledger_sum),
  i7 AS (SELECT id FROM ob WHERE original_fee_due_minor IS NULL)
  SELECT jsonb_build_object(
    'obligations', (SELECT count(*) FROM ob),
    'charged_eq_due_plus_adjustments', jsonb_build_object('violations', (SELECT count(*) FROM i1), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i1 LIMIT 50) x)),
    'cash_ledger_eq_fee_paid', jsonb_build_object('violations', (SELECT count(*) FROM i2), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i2 LIMIT 50) x)),
    'status_matches_amounts', jsonb_build_object('violations', (SELECT count(*) FROM i3), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i3 LIMIT 50) x)),
    'closed_orders_reviewed', jsonb_build_object('violations', (SELECT count(*) FROM i4), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i4 LIMIT 50) x)),
    'balance_eq_ledger_sum', jsonb_build_object('violations', (SELECT count(*) FROM i6), 'ids', (SELECT coalesce(jsonb_agg(store_id), '[]') FROM (SELECT store_id FROM i6 LIMIT 50) x)),
    'original_unknown', jsonb_build_object('count', (SELECT count(*) FROM i7), 'ids', (SELECT coalesce(jsonb_agg(id), '[]') FROM (SELECT id FROM i7 LIMIT 50) x))
  );
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9b. Financial-exception alert scan (cron, service_role) — idempotent by source_key.
--     Detects only states that need an admin decision; never corrects anything.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.store_commission_enqueue_exception_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review integer := 0;
  v_mismatch integer := 0;
  v_integrity integer := 0;
  v_payout integer := 0;
  v_report jsonb;
  v_check text;
  v_label text;
  r record;
BEGIN
  IF to_regclass('public.admin_notification_outbox') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'skipped', 'admin_notification_outbox_missing');
  END IF;

  -- 1) Open reviews whose alert never reached the outbox (e.g. enqueue failed in the trigger).
  FOR r IN
    SELECT ob.id FROM public.store_sale_fee_obligations ob
     WHERE ob.adjustment_status = 'review_required'
       AND NOT EXISTS (SELECT 1 FROM public.admin_notification_outbox x WHERE x.source_key = 'settlement_review:' || ob.id::text)
     ORDER BY ob.review_flagged_at NULLS LAST
     LIMIT 500
  LOOP
    IF public.store_commission_notify_review(r.id) THEN v_review := v_review + 1; END IF;
  END LOOP;

  -- 2) Cash balance ≠ ledger sum (keyed by store + current difference: a new difference = a new event).
  FOR r IN
    SELECT a.store_id, s.store_name, a.balance_minor,
           coalesce((SELECT sum(CASE WHEN l.direction = 'credit' THEN l.amount_minor ELSE -l.amount_minor END)
                       FROM public.business_cash_ledger l WHERE l.store_id = a.store_id), 0)::bigint AS ledger_sum
      FROM public.business_cash_accounts a
      JOIN public.stores s ON s.id = a.store_id
  LOOP
    CONTINUE WHEN r.balance_minor = r.ledger_sum;
    IF public.store_commission_notify_admin(
         'settlement_exception:balance_mismatch:' || r.store_id::text || ':' || (r.balance_minor - r.ledger_sum)::text,
         'settlement_financial_exception', 'critical',
         '[원장 불일치] ' || coalesce(r.store_name, r.store_id::text),
         '캐시 잔액 ' || public.store_commission_php_text(r.balance_minor) || ' ≠ 원장 합계 ' || public.store_commission_php_text(r.ledger_sum)
           || ' (차이 ' || public.store_commission_php_text(r.balance_minor - r.ledger_sum) || ') · 근거 확인 전 임의 정정 금지',
         '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id::text,
         'stores', r.store_id::text) THEN
      v_mismatch := v_mismatch + 1;
    END IF;
  END LOOP;

  -- 3) Obligation-level integrity violations (cash ledger ≠ fee paid = double charge / double refund suspect).
  v_report := public.store_commission_integrity_report(NULL);
  FOREACH v_check IN ARRAY ARRAY['charged_eq_due_plus_adjustments', 'cash_ledger_eq_fee_paid', 'status_matches_amounts', 'closed_orders_reviewed']
  LOOP
    v_label := CASE v_check
      WHEN 'cash_ledger_eq_fee_paid' THEN '이중 차감·환급 의심 (캐시 원장 ≠ 수수료 납부액)'
      WHEN 'charged_eq_due_plus_adjustments' THEN '부과액 ≠ 잔여 부과 + 승인 환급'
      WHEN 'status_matches_amounts' THEN '상태와 금액 불일치'
      ELSE '취소·환불 주문 수수료 검토 누락'
    END;
    FOR r IN
      SELECT ob.id, ob.store_id, o.order_no, st.store_name
        FROM jsonb_array_elements_text(coalesce(v_report -> v_check -> 'ids', '[]'::jsonb)) AS x(id)
        JOIN public.store_sale_fee_obligations ob ON ob.id = x.id::uuid
        JOIN public.store_orders o ON o.id = ob.order_id
        JOIN public.stores st ON st.id = ob.store_id
    LOOP
      IF public.store_commission_notify_admin(
           'settlement_exception:' || v_check || ':' || r.id::text,
           'settlement_financial_exception', 'critical',
           '[금융 예외] ' || coalesce(r.store_name, '') || ' · #' || coalesce(r.order_no, ''),
           v_label || ' · 근거 확인 전 임의 정정 금지',
           '/admin/store-settlements?tab=ledger&order_no=' || coalesce(r.order_no, '') || '&open=' || r.id::text,
           'store_sale_fee_obligations', r.id::text) THEN
        v_integrity := v_integrity + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- 4) Payout suspects: Coin above platform-held money (duplicate payout) / legacy manual payouts.
  FOR r IN
    SELECT x->>'order_id' AS order_id, x->>'order_no' AS order_no, x->>'store_id' AS store_id, x->>'store_name' AS store_name,
           (x->>'coin_over_credit')::bigint AS over, x->>'class' AS cls, (x->>'legacy_net_php')::bigint AS legacy_php
      FROM jsonb_array_elements(public.store_platform_payable_page(NULL, NULL, NULL, 'exceptions', 500, 0) -> 'rows') AS x
  LOOP
    IF r.over > 0 THEN
      IF public.store_commission_notify_admin(
           'settlement_exception:coin_over_credit:' || r.order_id,
           'settlement_financial_exception', 'critical',
           '[중복 지급 의심] ' || coalesce(r.store_name, '') || ' · #' || coalesce(r.order_no, ''),
           '플랫폼 보유분(상품권 레일 제외)보다 코인 ' || r.over::text || ' 초과 지급 · 근거 확인 전 회수 금지',
           '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id,
           'store_orders', r.order_id) THEN
        v_payout := v_payout + 1;
      END IF;
    END IF;
    IF r.cls = 'legacy_manual_paid' THEN
      IF public.store_commission_notify_admin(
           'settlement_exception:legacy_manual_paid:' || r.order_id,
           'settlement_financial_exception', 'warning',
           '[과거 수동 지급 확인] ' || coalesce(r.store_name, '') || ' · #' || coalesce(r.order_no, ''),
           '직접 결제 주문에 수동 지급 기록 ₱' || r.legacy_php::text || ' · 이중 지급 여부 확인 필요',
           '/admin/store-settlements?tab=exceptions&store_id=' || r.store_id,
           'store_orders', r.order_id) THEN
        v_payout := v_payout + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'review_replayed', v_review, 'balance_mismatch', v_mismatch,
                            'integrity', v_integrity, 'payout_suspects', v_payout);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Execute grants
-- ═══════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.store_commission_resolve_policy(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_commission_debit_internal(uuid, uuid, uuid, bigint, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.store_commission_charge_order_internal(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.store_orders_commission_lifecycle() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.store_orders_enforce_cash_order_gate() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.store_commission_adjustments_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.charge_sale_fee_for_order(uuid, uuid, uuid, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.flag_store_commission_review(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_decide_store_commission_adjustment(uuid, uuid, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_cash_order_gate_mode() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_cash_position(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_commission_ledger_page(uuid[], timestamptz, timestamptz, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_cash_ledger_page(uuid[], timestamptz, timestamptz, text[], integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_commission_integrity_report(uuid[]) FROM PUBLIC, anon, authenticated;
-- Legacy automatic full reversal would bypass the manual review → no caller may execute it.
REVOKE ALL ON FUNCTION public.reverse_sale_fee_for_order(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.store_commission_resolve_policy(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.charge_sale_fee_for_order(uuid, uuid, uuid, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.flag_store_commission_review(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_decide_store_commission_adjustment(uuid, uuid, text, bigint, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_cash_order_gate_mode() TO service_role;
GRANT EXECUTE ON FUNCTION public.store_cash_position(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_commission_ledger_page(uuid[], timestamptz, timestamptz, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_cash_ledger_page(uuid[], timestamptz, timestamptz, text[], integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_commission_integrity_report(uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.store_commission_breakdown(uuid[], timestamptz, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_platform_payable_page(uuid[], timestamptz, timestamptz, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_commission_breakdown(uuid[], timestamptz, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_platform_payable_page(uuid[], timestamptz, timestamptz, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.store_commission_php_text(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_commission_notify_admin(text, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.store_commission_notify_review(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.store_commission_enqueue_exception_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_commission_php_text(bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_commission_notify_admin(text, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.store_commission_enqueue_exception_notifications() TO service_role;
REVOKE ALL ON FUNCTION public.store_commission_notify_charge_failure(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_commission_notify_charge_failure(uuid, text, text) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Alert go-live baseline — exceptions that exist NOW (documented, OWNER decision pending:
--     ₱225 balance gap, Coin over-credit, legacy manual payouts) are not re-announced as new alerts.
--     Review alerts are not baselined. Only outbox keys are written; no money, no source rows.
-- ═══════════════════════════════════════════════════════════════════════════

-- One statement, so the transaction-local flag holds whether or not the runner wraps the file in BEGIN/COMMIT.
DO $$
BEGIN
  PERFORM set_config('dibay.settlement_alert_baseline', 'on', true);
  PERFORM public.store_commission_enqueue_exception_notifications();
  PERFORM set_config('dibay.settlement_alert_baseline', 'off', true);
END;
$$;

COMMIT;
