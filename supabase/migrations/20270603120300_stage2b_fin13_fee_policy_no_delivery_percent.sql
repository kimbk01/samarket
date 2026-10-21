-- Stage 2-B FIN-13 / Owner D-3: keep the current commission contract
--   base = payment_amount (incl. delivery fee) + gift_redemption_amount + platform_funded_amount
--   fee  = floor(base * fee_percent / 100) + fixed_fee
-- and refuse delivery_fee_mode = 'percent' (it would charge the delivery fee a second time: it is already
-- inside payment_amount). Doc: docs/store-commission-cash-settlement-ssot.md (D-3 section).
--
-- Production (read-only 2026-10-21, project ckdosyydvgzqwpbwuhon): store_fee_policies has no CHECK on
-- delivery_fee_mode; live values = {none}; rows with 'percent' = 0. Policies are written by the admin API
-- (service_role INSERT/UPDATE) and admin_supersede_store_fee_policy (INSERT) - a table CHECK covers both.
-- NOT VALID: existing rows are not re-validated (D-5, none violate today). No function changed, no data changed.
--
-- Rollback (manual, Owner approval):
--   ALTER TABLE public.store_fee_policies DROP CONSTRAINT store_fee_policies_delivery_fee_mode_not_percent_chk;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.store_fee_policies'::regclass
       AND conname = 'store_fee_policies_delivery_fee_mode_not_percent_chk'
  ) THEN
    ALTER TABLE public.store_fee_policies
      ADD CONSTRAINT store_fee_policies_delivery_fee_mode_not_percent_chk
      CHECK (delivery_fee_mode IS DISTINCT FROM 'percent') NOT VALID;
  END IF;
END $$;

COMMENT ON CONSTRAINT store_fee_policies_delivery_fee_mode_not_percent_chk ON public.store_fee_policies IS
  'D-3: delivery fee is already in the commission base (payment_amount); delivery_fee_mode=percent would double-charge it.';
