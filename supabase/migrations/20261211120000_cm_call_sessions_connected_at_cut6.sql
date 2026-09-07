-- CUT 6 — Connected / Duration SSOT
--
-- ACCEPTED ≠ CONNECTED:
--   answered_at  = callee acceptance (unchanged)
--   connected_at = first valid media-connected transition (server clock)
--
-- Duration authority (new rows):
--   duration = max(0, ended_at - connected_at)
--   never-connected → connected_at NULL → duration 0
--
-- Legacy rows with answered_at: backfill connected_at = answered_at so
-- historical duration (ended - answered) is preserved under the new formula.

BEGIN;

ALTER TABLE public.community_messenger_call_sessions
  ADD COLUMN IF NOT EXISTS connected_at timestamptz NULL;

COMMENT ON COLUMN public.community_messenger_call_sessions.connected_at IS
  'CUT6: first successful media connection (server time). NULL = never connected. Distinct from answered_at (acceptance).';

-- Preserve historical duration under connected_at-based formula.
-- Do NOT backfill live `active` rows (accepted ≠ connected while in-flight).
UPDATE public.community_messenger_call_sessions
SET connected_at = answered_at
WHERE connected_at IS NULL
  AND answered_at IS NOT NULL
  AND status IN ('ended', 'cancelled', 'rejected', 'missed', 'failed');

COMMIT;
