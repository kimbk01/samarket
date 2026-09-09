-- DIBAY DATA RESET — BLOCKER CLOSE (B1 / B2)
-- Store / order DELETE must not CASCADE-wipe Finance / Gift / fee history.
-- Operating catalog FKs (products/menus/discovery) keep CASCADE — out of scope.
-- Does NOT weaken finance immutable DELETE triggers.

BEGIN;

CREATE OR REPLACE FUNCTION public.__drbc_set_fk_on_delete(
  p_child_table text,
  p_child_column text,
  p_parent_table text,
  p_on_delete text
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conname text;
  v_ref_col text;
BEGIN
  IF p_on_delete NOT IN ('RESTRICT', 'SET NULL', 'CASCADE') THEN
    RAISE EXCEPTION 'drbc: invalid on_delete %', p_on_delete;
  END IF;

  SELECT c.conname,
         (
           SELECT pa.attname
           FROM unnest(c.confkey) WITH ORDINALITY AS ck(attnum, ord)
           JOIN pg_attribute pa
             ON pa.attrelid = c.confrelid
            AND pa.attnum = ck.attnum
           ORDER BY ck.ord
           LIMIT 1
         )
    INTO v_conname, v_ref_col
  FROM pg_constraint c
  JOIN pg_class rel ON rel.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  JOIN pg_attribute a
    ON a.attrelid = c.conrelid
   AND a.attnum = ANY (c.conkey)
   AND NOT a.attisdropped
  JOIN pg_class pref ON pref.oid = c.confrelid
  JOIN pg_namespace pn ON pn.oid = pref.relnamespace
  WHERE c.contype = 'f'
    AND n.nspname = 'public'
    AND rel.relname = p_child_table
    AND a.attname = p_child_column
    AND pn.nspname = 'public'
    AND pref.relname = p_parent_table
    AND array_length(c.conkey, 1) = 1
  LIMIT 1;

  IF v_conname IS NULL OR v_ref_col IS NULL THEN
    RAISE NOTICE 'drbc: skip missing FK %.% → %', p_child_table, p_child_column, p_parent_table;
    RETURN;
  END IF;

  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_child_table, v_conname);

  IF p_on_delete = 'SET NULL' THEN
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE SET NULL',
      p_child_table, v_conname, p_child_column, p_parent_table, v_ref_col
    );
  ELSIF p_on_delete = 'CASCADE' THEN
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE CASCADE',
      p_child_table, v_conname, p_child_column, p_parent_table, v_ref_col
    );
  ELSE
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(%I) ON DELETE RESTRICT',
      p_child_table, v_conname, p_child_column, p_parent_table, v_ref_col
    );
  END IF;

  RAISE NOTICE 'drbc: %.% → % ON DELETE %', p_child_table, p_child_column, p_parent_table, p_on_delete;
END;
$$;

COMMENT ON FUNCTION public.__drbc_set_fk_on_delete(text, text, text, text) IS
  'DATA RESET BLOCKER CLOSE — rewrite single-column FK ON DELETE action. Temporary helper; dropped at end of migration.';

-- ═══════════════════════════════════════════════════════════════════════════
-- B1: stores → Finance / Gift / fee / historical order — CASCADE → RESTRICT
-- ═══════════════════════════════════════════════════════════════════════════

-- Gift value + Store Cash
SELECT public.__drbc_set_fk_on_delete('gift_certificate_applications', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('gift_certificate_products', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('gift_certificate_instances', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('gift_certificate_redemptions', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('gift_certificate_revenue_ledger', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('gift_certificate_cash_out_requests', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('gift_certificate_conversion_requests', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('store_cash_accounts', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('store_cash_ledger', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('store_cash_recovery_obligations', 'store_id', 'stores', 'RESTRICT');

-- Coin (economic) + Business Cash
SELECT public.__drbc_set_fk_on_delete('store_economic_point_accounts', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('store_economic_point_ledger', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('business_cash_accounts', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('business_cash_ledger', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('business_cash_charge_requests', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('coin_withdrawal_requests', 'store_id', 'stores', 'RESTRICT');

-- Sale fee / settlements / orders (historical)
SELECT public.__drbc_set_fk_on_delete('sale_fee_obligations', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('store_settlements', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('store_orders', 'store_id', 'stores', 'RESTRICT');

-- Coupon redemption history (not unused campaign catalog)
SELECT public.__drbc_set_fk_on_delete('store_coupon_redemptions', 'store_id', 'stores', 'RESTRICT');

-- Legacy store point ledger/account if present
SELECT public.__drbc_set_fk_on_delete('store_point_accounts', 'store_id', 'stores', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('store_point_ledger', 'store_id', 'stores', 'RESTRICT');

-- ═══════════════════════════════════════════════════════════════════════════
-- B2: store_orders → Gift / fee / coupon redemption — CASCADE → RESTRICT
-- Derived projections / events may keep CASCADE (not finance value).
-- ═══════════════════════════════════════════════════════════════════════════

SELECT public.__drbc_set_fk_on_delete('gift_certificate_redemptions', 'order_id', 'store_orders', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('sale_fee_obligations', 'order_id', 'store_orders', 'RESTRICT');
SELECT public.__drbc_set_fk_on_delete('store_coupon_redemptions', 'order_id', 'store_orders', 'RESTRICT');

DROP FUNCTION public.__drbc_set_fk_on_delete(text, text, text, text);

COMMIT;
