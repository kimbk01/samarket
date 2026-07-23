-- ROLLBACK for 20261005120000_dibay_messenger_domain_atomic_mark_read.sql
--
-- MANUAL ONLY — not part of supabase/migrations auto runner.
-- See supabase/rollback/README.md
--
-- Safe to run if Phase 8B RPCs were applied in a non-prod / approved environment.
-- Production route wiring must remain OFF before running.

DROP FUNCTION IF EXISTS public.dibay_messenger_domain_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text
);

DROP FUNCTION IF EXISTS public.dibay_store_order_atomic_mark_read(
  uuid, uuid, text, text, bigint, uuid, text, text, uuid, uuid
);

-- Removes idempotency audit/replay rows — data loss possible.
DROP TABLE IF EXISTS public.dibay_domain_mark_read_idempotency;

-- Optional: leave mark_read_generation column (non-breaking). To fully revert:
-- ALTER TABLE public.community_messenger_participants DROP COLUMN IF EXISTS mark_read_generation;
