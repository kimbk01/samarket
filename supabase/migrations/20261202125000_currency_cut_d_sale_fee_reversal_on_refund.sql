-- CUT D follow-up: reverse/release sale fee on order refund (accounting integrity)

BEGIN;

ALTER TABLE public.business_cash_ledger
  DROP CONSTRAINT IF EXISTS business_cash_ledger_entry_kind_check;

ALTER TABLE public.business_cash_ledger
  ADD CONSTRAINT business_cash_ledger_entry_kind_check
  CHECK (entry_kind IN (
    'TOP_UP',
    'CONVERT_FROM_STORE_POINTS',
    'AD_SPEND',
    'AD_REFUND',
    'PARTNER_SPEND',
    'PARTNER_REFUND',
    'SALE_FEE',
    'SALE_FEE_SETTLEMENT',
    'SALE_FEE_REVERSAL',
    'ADMIN_ADJUST',
    'SYSTEM'
  ));

CREATE OR REPLACE FUNCTION public.reverse_sale_fee_for_order(
  p_order_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_ob public.store_sale_fee_obligations%ROWTYPE;
  v_existing uuid;
  v_credit bigint := 0;
  v_bc_bal bigint;
  v_ledger uuid;
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_order_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_input');
  END IF;

  SELECT id INTO v_existing
    FROM public.business_cash_ledger
   WHERE idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'reversal_ledger_id', v_existing, 'order_id', p_order_id
    );
  END IF;

  SELECT * INTO v_ob
    FROM public.store_sale_fee_obligations
   WHERE order_id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'order_id', p_order_id);
  END IF;

  IF v_ob.status = 'waived' THEN
    RETURN jsonb_build_object(
      'ok', true, 'idempotent', true, 'obligation_id', v_ob.id, 'order_id', p_order_id
    );
  END IF;

  v_credit := coalesce(v_ob.fee_paid_minor, 0);

  IF v_credit > 0 THEN
    PERFORM public.ensure_business_cash_account(v_ob.store_id);

    UPDATE public.business_cash_accounts
       SET balance_minor = balance_minor + v_credit, updated_at = now()
     WHERE store_id = v_ob.store_id
     RETURNING balance_minor INTO v_bc_bal;

    INSERT INTO public.business_cash_ledger (
      store_id, entry_kind, direction, amount_minor, balance_after_minor,
      related_type, related_id, idempotency_key, actor_type, meta
    ) VALUES (
      v_ob.store_id, 'SALE_FEE_REVERSAL', 'credit', v_credit, v_bc_bal,
      'store_order', p_order_id::text,
      v_key, 'system',
      jsonb_build_object(
        'order_id', p_order_id,
        'obligation_id', v_ob.id,
        'fee_paid_minor_reversed', v_credit,
        'fee_outstanding_cancelled', v_ob.fee_outstanding_minor
      )
    ) RETURNING id INTO v_ledger;
  END IF;

  UPDATE public.store_sale_fee_obligations
     SET fee_outstanding_minor = 0,
         fee_paid_minor = 0,
         fee_due_minor = 0,
         status = 'waived',
         settled_at = coalesce(settled_at, now())
   WHERE id = v_ob.id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'order_id', p_order_id,
    'obligation_id', v_ob.id,
    'cash_credited_minor', v_credit,
    'reversal_ledger_id', v_ledger,
    'outstanding_cancelled_minor', v_ob.fee_outstanding_minor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_sale_fee_for_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_sale_fee_for_order(uuid, text) TO service_role;

COMMIT;
