-- ROLLBACK for DIBAY Finance SSOT-19 D3. Apply FIRST, outside a transaction.
DROP INDEX CONCURRENTLY IF EXISTS public.point_ledger_refund_release_once_uidx;
