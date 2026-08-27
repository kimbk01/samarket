-- DIBAY Gift Certificate Public Gift Number
-- Display/support/admin lookup identity only. UUID remains financial authority.

BEGIN;

ALTER TABLE public.gift_certificate_instances
  ADD COLUMN IF NOT EXISTS public_gift_number text;

CREATE OR REPLACE FUNCTION public.generate_gift_public_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(10);
  v_out text := 'GFT-';
  i integer;
BEGIN
  FOR i IN 0..9 LOOP
    IF i = 5 THEN
      v_out := v_out || '-';
    END IF;
    v_out := v_out || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  END LOOP;
  RETURN v_out;
END;
$$;

COMMENT ON FUNCTION public.generate_gift_public_number() IS
  'Generates non-sequential human-readable gift certificate public numbers. Not an ownership/redeem authority.';

UPDATE public.gift_certificate_instances
   SET public_gift_number = public.generate_gift_public_number()
 WHERE public_gift_number IS NULL
    OR btrim(public_gift_number) = '';

CREATE UNIQUE INDEX IF NOT EXISTS gift_certificate_instances_public_number_uq
  ON public.gift_certificate_instances (public_gift_number);

ALTER TABLE public.gift_certificate_instances
  ALTER COLUMN public_gift_number SET DEFAULT public.generate_gift_public_number(),
  ALTER COLUMN public_gift_number SET NOT NULL;

ALTER TABLE public.gift_certificate_instances
  DROP CONSTRAINT IF EXISTS gift_certificate_instances_public_number_format_chk,
  ADD CONSTRAINT gift_certificate_instances_public_number_format_chk
    CHECK (public_gift_number ~ '^GFT-[A-Z2-9]{5}-[A-Z2-9]{5}$');

COMMENT ON COLUMN public.gift_certificate_instances.public_gift_number IS
  'Public display/support lookup number. Not redeem, transfer, wallet claim, or ownership authority.';

CREATE INDEX IF NOT EXISTS gift_certificate_instances_public_number_search_idx
  ON public.gift_certificate_instances (public_gift_number text_pattern_ops);

CREATE OR REPLACE FUNCTION public.gift_certificate_purchase(
  p_buyer_user_id uuid,
  p_product_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_product public.gift_certificate_products%ROWTYPE;
  v_cache integer;
  v_sum integer;
  v_balance_after integer;
  v_instance_id uuid;
  v_public_gift_number text;
  v_existing_instance_id uuid;
  v_now timestamptz := now();
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF p_buyer_user_id IS NULL OR p_product_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_args');
  END IF;

  SELECT * INTO v_product
    FROM public.gift_certificate_products
   WHERE id = p_product_id
     AND active = true
     AND sales_starts_at <= v_now
     AND (sales_ends_at IS NULL OR sales_ends_at > v_now)
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'product_not_found');
  END IF;
  IF v_product.max_issuance IS NOT NULL
     AND coalesce(v_product.issued_count, 0) >= v_product.max_issuance THEN
    RETURN jsonb_build_object('ok', false, 'error', 'max_issuance_reached');
  END IF;
  IF v_product.purchase_price < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_price');
  END IF;

  SELECT points INTO v_cache
    FROM public.profiles
   WHERE id = p_buyer_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  v_sum := public.sum_user_point_ledger(p_buyer_user_id);
  IF coalesce(v_cache, 0) IS DISTINCT FROM GREATEST(0, v_sum) THEN
    PERFORM public.project_user_point_balance_from_ledger(p_buyer_user_id);
    v_sum := public.sum_user_point_ledger(p_buyer_user_id);
  END IF;

  IF GREATEST(0, v_sum) < v_product.purchase_price THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance', 'code', 'insufficient_balance');
  END IF;

  v_balance_after := GREATEST(0, v_sum) - v_product.purchase_price;

  INSERT INTO public.point_ledger (
    user_id, entry_type, amount, balance_after,
    related_type, related_id, description, actor_type
  ) VALUES (
    p_buyer_user_id,
    'spend',
    -v_product.purchase_price,
    v_balance_after,
    'gift_certificate_purchase',
    v_key,
    left('상품권 구매: ' || coalesce(v_product.title, ''), 500),
    'user'
  );

  PERFORM public.project_user_point_balance_from_ledger(p_buyer_user_id);

  v_instance_id := gen_random_uuid();
  v_public_gift_number := public.generate_gift_public_number();
  INSERT INTO public.gift_certificate_instances (
    id, public_gift_number, product_id, store_id, purchaser_user_id, current_owner_user_id,
    face_value, purchase_price, remaining_balance, status, version, purchased_at, created_at
  ) VALUES (
    v_instance_id,
    v_public_gift_number,
    v_product.id,
    v_product.store_id,
    p_buyer_user_id,
    p_buyer_user_id,
    v_product.face_value,
    v_product.purchase_price,
    v_product.face_value,
    'ACTIVE',
    1,
    v_now,
    v_now
  );

  INSERT INTO public.gift_certificate_ownership_events (
    instance_id, seq, event_type, from_user_id, to_user_id, actor_user_id, payload
  ) VALUES (
    v_instance_id,
    1,
    'PURCHASED',
    NULL,
    p_buyer_user_id,
    p_buyer_user_id,
    jsonb_build_object('product_id', v_product.id, 'idempotency_key', v_key)
  );

  INSERT INTO public.gift_certificate_ledger (
    instance_id, store_id, user_id, entry_type, amount,
    related_type, related_id, description, actor_type
  ) VALUES (
    v_instance_id,
    v_product.store_id,
    p_buyer_user_id,
    'ISSUED',
    v_product.face_value,
    'gift_certificate_purchase',
    v_key,
    'Gift certificate purchased',
    'user'
  );

  UPDATE public.gift_certificate_products
     SET issued_count = coalesce(issued_count, 0) + 1,
         updated_at = v_now
   WHERE id = v_product.id;

  RETURN jsonb_build_object(
    'ok', true,
    'instance_id', v_instance_id,
    'public_gift_number', v_public_gift_number,
    'face_value', v_product.face_value,
    'purchase_price', v_product.purchase_price,
    'balance_after', v_balance_after
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT gl.instance_id INTO v_existing_instance_id
      FROM public.gift_certificate_ledger gl
     WHERE gl.related_type = 'gift_certificate_purchase'
       AND gl.related_id = v_key
       AND gl.entry_type = 'ISSUED'
     LIMIT 1;
    SELECT i.public_gift_number INTO v_public_gift_number
      FROM public.gift_certificate_instances i
     WHERE i.id = v_existing_instance_id;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'instance_id', v_existing_instance_id,
      'public_gift_number', v_public_gift_number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.generate_gift_public_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_gift_public_number() TO service_role;

COMMIT;
