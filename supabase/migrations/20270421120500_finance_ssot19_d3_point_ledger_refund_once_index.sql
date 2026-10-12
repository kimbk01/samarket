-- DIBAY Finance SSOT-19 · D3 — F-01 / R-01 database guard.
-- At most one ad_refund / ad_hold_release row per (user, related_type, related_id).
-- Every writer of these entry types uses an event-unique related_id
-- (adId, release:{holdId}, compensate:{holdId}, hold_insert_fail_release:{reqId},
-- renew-refund:{campaign}:{key}); production has 0 duplicate groups (2026-10-12).
-- 'refund' is intentionally excluded (no writer in HEAD to verify semantics).
-- CONCURRENTLY: must run outside a transaction block (no BEGIN/COMMIT).

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS point_ledger_refund_release_once_uidx
  ON public.point_ledger (user_id, related_type, related_id, entry_type)
  WHERE entry_type IN ('ad_refund', 'ad_hold_release');
