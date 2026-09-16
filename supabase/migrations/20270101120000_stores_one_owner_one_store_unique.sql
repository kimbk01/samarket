-- CUT 1: ONE ACCOUNT = ONE STORE DB authority
-- Contract: non-null owner_user_id → at most one public.stores row.
-- Live pre-check (CUT 1A): duplicateOwnerCount=0, nullOwnerUserIdCount=0.
-- Partial unique index remains correct if column is nullable; also correct if NOT NULL.

CREATE UNIQUE INDEX IF NOT EXISTS stores_one_owner_one_store_uidx
  ON public.stores (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

COMMENT ON INDEX public.stores_one_owner_one_store_uidx IS
  'DIBAY Delivery: one auth account owns at most one store (CUT 1 UNIQUE authority)';
