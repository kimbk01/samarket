-- Durable incoming-call push claim (serverless multi-instance safe).
-- Replaces process-local Map dedupe for VoIP/FCM dispatch.
-- See docs/dibay-call-multi-device-policy.md

ALTER TABLE public.community_messenger_call_sessions
  ADD COLUMN IF NOT EXISTS incoming_push_claimed_at timestamptz NULL;

COMMENT ON COLUMN public.community_messenger_call_sessions.incoming_push_claimed_at IS
  'CAS lock for critical-path incoming call push fan-out (one winner across serverless instances).';
