-- Four-domain call session envelope (nullable dual-write window).
-- Write path: startCommunityMessengerCallSession copies from rooms at insert.
-- Backfill UPDATEs remain commented until dry-run approval.

ALTER TABLE public.community_messenger_call_sessions
  ADD COLUMN IF NOT EXISTS chat_domain text NULL,
  ADD COLUMN IF NOT EXISTS domain_identity_key text NULL;

ALTER TABLE public.community_messenger_call_sessions
  DROP CONSTRAINT IF EXISTS community_messenger_call_sessions_chat_domain_check;

ALTER TABLE public.community_messenger_call_sessions
  ADD CONSTRAINT community_messenger_call_sessions_chat_domain_check
  CHECK (
    chat_domain IS NULL
    OR chat_domain IN ('general_direct', 'group', 'trade', 'store_order')
  );

COMMENT ON COLUMN public.community_messenger_call_sessions.chat_domain IS
  'Immutable snapshot of room chat_domain at call start; push/cold-start SSOT with room_id.';
COMMENT ON COLUMN public.community_messenger_call_sessions.domain_identity_key IS
  'Immutable snapshot of room domain_identity_key at call start.';

CREATE INDEX IF NOT EXISTS idx_cm_call_sessions_domain_identity_key
  ON public.community_messenger_call_sessions (domain_identity_key)
  WHERE domain_identity_key IS NOT NULL;

-- Optional backfill (DO NOT uncomment without dry-run):
-- UPDATE public.community_messenger_call_sessions s
-- SET chat_domain = r.chat_domain,
--     domain_identity_key = COALESCE(r.domain_identity_key, r.domain_identity)
-- FROM public.community_messenger_rooms r
-- WHERE s.room_id = r.id
--   AND s.chat_domain IS NULL
--   AND r.chat_domain IS NOT NULL;
