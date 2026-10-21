-- Pre-existing (pre-cutoff, D-5) rows that the migrations must leave untouched and classify as legacy_preserved.
-- Shapes mirror production: store with Cash balance 0 vs ledger sum 22,500 (PHP 225), an obligation whose status
-- disagrees with its amounts, an APPROVED top-up without payment evidence, a pre-cutoff Coin over-credit suspect.

INSERT INTO public.business_cash_accounts(store_id, balance_minor, updated_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', 0, '2026-09-17 14:53:56+00');
INSERT INTO public.business_cash_ledger(store_id, entry_kind, direction, amount_minor, balance_after_minor,
  related_type, related_id, idempotency_key, actor_type, created_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', 'TOP_UP', 'credit', 22500, 22500,
  'business_cash_charge_request', 'legacy', 'legacy:topup:c', 'admin', '2026-09-17 14:53:56+00');

DO $$
DECLARE v_ob uuid;
BEGIN
  v_ob := public.t_obligation('aaaaaaaa-0000-0000-0000-000000000003', 500, '2026-09-01 00:00:00+00');
  -- status/amount disagreement (open with nothing outstanding) on an old row
  UPDATE public.store_sale_fee_obligations SET fee_paid_minor = 500, fee_outstanding_minor = 0 WHERE id = v_ob;
END $$;

INSERT INTO public.business_cash_charge_requests(store_id, owner_user_id, amount_minor, status, idempotency_key, created_at, decided_at)
VALUES ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 1000, 'APPROVED',
        'legacy:approved:c', '2026-09-10 00:00:00+00', '2026-09-10 01:00:00+00');

INSERT INTO public.store_orders(id, order_no, store_id, order_status, created_at)
VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'LEGACY-COIN', 'aaaaaaaa-0000-0000-0000-000000000003', 'completed', '2026-09-05 00:00:00+00');
INSERT INTO public.test_payable_rows(row) VALUES (jsonb_build_object(
  'order_id', 'bbbbbbbb-0000-0000-0000-000000000001', 'order_no', 'LEGACY-COIN',
  'store_id', 'aaaaaaaa-0000-0000-0000-000000000003', 'store_name', 'Store C legacy',
  'coin_over_credit', 9050, 'class', 'coin_over', 'legacy_net_php', 0));

CREATE TABLE public.t_legacy_snapshot AS
  SELECT 'acct'::text AS k, store_id::text AS id, balance_minor::text AS v FROM public.business_cash_accounts
  UNION ALL SELECT 'ledger', id::text, amount_minor::text || ':' || idempotency_key FROM public.business_cash_ledger
  UNION ALL SELECT 'ob', id::text, fee_paid_minor::text || ':' || fee_outstanding_minor::text || ':' || status FROM public.store_sale_fee_obligations
  UNION ALL SELECT 'req', id::text, status || ':' || amount_minor::text FROM public.business_cash_charge_requests;
