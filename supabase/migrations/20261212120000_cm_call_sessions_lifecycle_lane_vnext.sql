-- FD4 RESTORE_LOCAL_ARTIFACT
-- Remote history version 20261212120000 existed without local SQL (statements NULL).
-- Reconstructed from live Production catalog only (ckdosyydvgzqwpbwuhon):
--   community_messenger_call_sessions.lifecycle_lane text NULL
--   comment present
--   index community_messenger_call_sessions_lifecycle_lane_idx
-- Idempotent. Does not change Call session writers / Native lifecycle.

BEGIN;

ALTER TABLE public.community_messenger_call_sessions
  ADD COLUMN IF NOT EXISTS lifecycle_lane text NULL;

COMMENT ON COLUMN public.community_messenger_call_sessions.lifecycle_lane IS
  'Call vNext Boundary A: vnext rows are mutated only by lib/call-vnext/server. Legacy writer must refuse.';

CREATE INDEX IF NOT EXISTS community_messenger_call_sessions_lifecycle_lane_idx
  ON public.community_messenger_call_sessions USING btree (lifecycle_lane)
  WHERE (lifecycle_lane IS NOT NULL);

COMMIT;
