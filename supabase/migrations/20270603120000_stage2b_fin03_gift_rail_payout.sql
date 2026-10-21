-- Stage 2-B FIN-03 (=GFT-03) - Owner D-2 option A (separate rails).
-- Gift certificate merchant net (gift_certificate_revenue_ledger REVENUE_AVAILABLE) is paid to the store on the
-- GIFT RAIL by an admin payout. Coin is NOT used for gift money (only the platform-funded coupon becomes Coin -
-- see 20270603120100). Assets are never merged.
--
-- Production base (read-only snapshot 2026-10-21, project ckdosyydvgzqwpbwuhon):
--   public.gift_certificate_store_revenue_available(uuid)  md5(prosrc) = f61498267bb47af2b53da858ccc086eb
--   gift_certificate_revenue_ledger.entry_type has NO CHECK constraint in prod (live entry types:
--   REVENUE_CREATE, REVENUE_AVAILABLE, REVERSED, RECOGNITION_CORRECTION, CONVERSION_REQUEST, CONVERSION_APPROVE;
--   CASH_OUT_HOLD/RELEASE/PAID are store-initiated cash-out markers, rail retired). A new entry type
--   'PAYOUT_PAID' is added because no existing type means "platform paid the store from available revenue"
--   (CASH_OUT_PAID is an amount-0 marker after a HOLD).
--
-- Changes:
--   1) table public.gift_certificate_store_payouts (one immutable row per admin payout; reference unique,
--      idempotency key unique). Client roles have no access; service_role may only SELECT (writes via RPC).
--   2) gift_certificate_store_revenue_available: 'PAYOUT_PAID' added to the netting list (only diff).
--   3) RPC gift_certificate_admin_store_payout (SECURITY DEFINER, EXECUTE service_role only): platform admin
--      re-check, amount <= available (per-store advisory lock, same key as the gift rail writers), payout
--      reference required + unique, idempotency key, PAYOUT_PAID ledger row (-amount) + audit_logs row.
--   4) reader gift_certificate_store_payout_summary(uuid): available / paid out / count / last paid
--      (one SQL reader for Admin + Owner).
-- Data: no existing row is read for correction or changed (D-5). New rows only.
--
-- Rollback (manual, Owner approval):
--   DROP FUNCTION public.gift_certificate_admin_store_payout(uuid, uuid, integer, text, text, text, text);
--   DROP FUNCTION public.gift_certificate_store_payout_summary(uuid);
--   Restore gift_certificate_store_revenue_available from the prod base body ONLY if
--   `SELECT count(*) FROM gift_certificate_revenue_ledger WHERE entry_type = 'PAYOUT_PAID'` = 0
--   (otherwise paid money would count as available again). Keep the payouts table (payout evidence).

-- 1) payout record ---------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_certificate_store_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  amount integer NOT NULL CHECK (amount > 0),
  payout_method text NOT NULL CHECK (btrim(payout_method) <> ''),
  payout_reference text NOT NULL CHECK (btrim(payout_reference) <> ''),
  payout_note text,
  idempotency_key text NOT NULL,
  admin_user_id uuid NOT NULL,
  available_before integer NOT NULL,
  available_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gift_certificate_store_payouts_idem_uq UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS gift_certificate_store_payouts_reference_uq
  ON public.gift_certificate_store_payouts (lower(btrim(payout_reference)));
CREATE INDEX IF NOT EXISTS gift_certificate_store_payouts_store_idx
  ON public.gift_certificate_store_payouts (store_id, created_at DESC);

ALTER TABLE public.gift_certificate_store_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gift_certificate_store_payouts FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.gift_certificate_store_payouts FROM service_role;
GRANT SELECT ON TABLE public.gift_certificate_store_payouts TO service_role;

CREATE OR REPLACE FUNCTION public.gift_certificate_store_payouts_forbid_mutate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'gift_certificate_store_payouts_immutable' USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS trg_gift_certificate_store_payouts_block_client_role_writes ON public.gift_certificate_store_payouts;
CREATE TRIGGER trg_gift_certificate_store_payouts_block_client_role_writes
  BEFORE INSERT OR DELETE OR UPDATE ON public.gift_certificate_store_payouts
  FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes();

DROP TRIGGER IF EXISTS trg_gift_certificate_store_payouts_no_mutate ON public.gift_certificate_store_payouts;
CREATE TRIGGER trg_gift_certificate_store_payouts_no_mutate
  BEFORE UPDATE OR DELETE ON public.gift_certificate_store_payouts
  FOR EACH ROW EXECUTE FUNCTION public.gift_certificate_store_payouts_forbid_mutate();

COMMENT ON TABLE public.gift_certificate_store_payouts IS
  'Stage 2-B FIN-03 option A: admin payouts of gift certificate merchant net (gift rail). Immutable. Each row has one gift_certificate_revenue_ledger PAYOUT_PAID row (related_type gift_store_payout, related_id = id).';

-- 2) available = ledger netting incl. PAYOUT_PAID (prod base f61498267bb47af2b53da858ccc086eb) ------------
CREATE OR REPLACE FUNCTION public.gift_certificate_store_revenue_available(p_store_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
          'CASH_OUT_PAID',
          'PAYOUT_PAID'
        )
    ), 0)
    - COALESCE((
      SELECT SUM(c.amount)::integer
      FROM public.gift_certificate_conversion_requests c
      WHERE c.store_id = p_store_id
        AND c.status = 'REQUESTED'
    ), 0)
  )::integer;
$function$;

-- 3) admin payout RPC --------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_admin_store_payout(
  p_admin_user_id uuid,
  p_store_id uuid,
  p_amount integer,
  p_payout_method text,
  p_payout_reference text,
  p_payout_note text,
  p_idempotency_key text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_method text := nullif(left(btrim(coalesce(p_payout_method, '')), 40), '');
  v_ref text := nullif(left(btrim(coalesce(p_payout_reference, '')), 120), '');
  v_note text := nullif(left(btrim(coalesce(p_payout_note, '')), 1000), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_prev public.gift_certificate_store_payouts%ROWTYPE;
  v_avail integer;
  v_id uuid;
  v_ledger uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_admin_user_id IS NULL OR p_store_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;
  IF v_method IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_method_required');
  END IF;
  IF v_ref IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_reference_required');
  END IF;
  IF NOT internal.is_platform_admin(p_admin_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = p_store_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'store_not_found');
  END IF;

  -- Same per-store lock as the gift rail cash-out / conversion writers: one available check at a time.
  PERFORM pg_advisory_xact_lock(hashtext('gift_rev:' || p_store_id::text));

  SELECT * INTO v_prev
    FROM public.gift_certificate_store_payouts
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_prev.store_id = p_store_id AND v_prev.amount = p_amount
       AND lower(v_prev.payout_reference) = lower(v_ref) THEN
      RETURN jsonb_build_object(
        'ok', true, 'idempotent', true, 'payout_id', v_prev.id, 'amount', v_prev.amount,
        'available_before', v_prev.available_before, 'available_after', v_prev.available_after
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_conflict');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.gift_certificate_store_payouts
     WHERE lower(btrim(payout_reference)) = lower(v_ref)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_reference_duplicate');
  END IF;

  v_avail := public.gift_certificate_store_revenue_available(p_store_id);
  IF p_amount > v_avail THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payout_exceeds_available', 'available', v_avail);
  END IF;

  INSERT INTO public.gift_certificate_store_payouts (
    store_id, amount, payout_method, payout_reference, payout_note, idempotency_key,
    admin_user_id, available_before, available_after
  ) VALUES (
    p_store_id, p_amount, v_method, v_ref, v_note, v_key,
    p_admin_user_id, v_avail, v_avail - p_amount
  ) RETURNING id INTO v_id;

  INSERT INTO public.gift_certificate_revenue_ledger (
    store_id, redemption_id, entry_type, amount, related_type, related_id
  ) VALUES (
    p_store_id, NULL, 'PAYOUT_PAID', -p_amount, 'gift_store_payout', v_id::text
  ) RETURNING id INTO v_ledger;

  INSERT INTO public.audit_logs (
    actor_type, actor_id, target_type, target_id, action, before_json, after_json
  ) VALUES (
    'admin', p_admin_user_id, 'gift_certificate_store_payout', v_id::text, 'gift_certificate.store_payout',
    jsonb_build_object('store_id', p_store_id, 'available', v_avail),
    jsonb_build_object(
      'store_id', p_store_id, 'amount', p_amount, 'available', v_avail - p_amount,
      'payout_method', v_method, 'payout_reference', v_ref, 'payout_note', v_note,
      'ledger_id', v_ledger, 'idempotency_key', v_key
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'idempotent', false, 'payout_id', v_id, 'ledger_id', v_ledger, 'amount', p_amount,
    'available_before', v_avail, 'available_after', v_avail - p_amount
  );
EXCEPTION
  WHEN unique_violation THEN
    -- Same key / reference committed by another store's payout in parallel (different advisory lock).
    SELECT * INTO v_prev
      FROM public.gift_certificate_store_payouts
     WHERE idempotency_key = v_key;
    IF FOUND AND v_prev.store_id = p_store_id AND v_prev.amount = p_amount
       AND lower(v_prev.payout_reference) = lower(v_ref) THEN
      RETURN jsonb_build_object(
        'ok', true, 'idempotent', true, 'payout_id', v_prev.id, 'amount', v_prev.amount,
        'available_before', v_prev.available_before, 'available_after', v_prev.available_after
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'payout_reference_duplicate');
END;
$function$;

REVOKE ALL ON FUNCTION public.gift_certificate_admin_store_payout(uuid, uuid, integer, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_admin_store_payout(uuid, uuid, integer, text, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.gift_certificate_admin_store_payout(uuid, uuid, integer, text, text, text, text) IS
  'Stage 2-B FIN-03 option A: admin pays a store gift rail available revenue. Admin re-check, amount <= available, unique payout reference, idempotency key, PAYOUT_PAID ledger + audit_logs in one transaction.';

-- 4) one reader for Admin + Owner -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_certificate_store_payout_summary(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'store_id', p_store_id,
    'available', public.gift_certificate_store_revenue_available(p_store_id),
    'paid_out', coalesce((SELECT sum(p.amount) FROM public.gift_certificate_store_payouts p
                           WHERE p.store_id = p_store_id), 0),
    'payout_count', (SELECT count(*) FROM public.gift_certificate_store_payouts p
                      WHERE p.store_id = p_store_id),
    'last_paid_at', (SELECT max(p.created_at) FROM public.gift_certificate_store_payouts p
                      WHERE p.store_id = p_store_id)
  );
$function$;

REVOKE ALL ON FUNCTION public.gift_certificate_store_payout_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_certificate_store_payout_summary(uuid) TO service_role;
