-- Multi-device first-answer-wins: claim owner device on accept.
-- See docs/dibay-call-multi-device-policy.md

ALTER TABLE public.community_messenger_call_sessions
  ADD COLUMN IF NOT EXISTS answered_device_id text NULL;

COMMENT ON COLUMN public.community_messenger_call_sessions.answered_device_id IS
  'First callee device that won accept claim (deviceId). NULL until accepted.';

CREATE INDEX IF NOT EXISTS community_messenger_call_sessions_answered_device_id_idx
  ON public.community_messenger_call_sessions (answered_device_id)
  WHERE answered_device_id IS NOT NULL;
