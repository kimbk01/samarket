-- CUT B follow-up: refund REVERSAL must debit full credited ledger amount.
-- Withdrawals remain gated separately; nonnegative was blocking exact reversal when
-- balance < credited (e.g. prior withdrawal or another reversal on same store).

BEGIN;

ALTER TABLE public.store_economic_point_accounts
  DROP CONSTRAINT IF EXISTS store_economic_point_accounts_balance_nonneg_chk;

COMMIT;
