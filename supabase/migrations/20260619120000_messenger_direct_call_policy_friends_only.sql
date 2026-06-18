-- CM direct call privacy — Telegram-style default friends_only

UPDATE public.profiles
SET messenger_direct_call_policy = 'friends_only'
WHERE messenger_direct_call_policy IS NULL
   OR messenger_direct_call_policy = 'everyone';

ALTER TABLE public.profiles
  ALTER COLUMN messenger_direct_call_policy SET DEFAULT 'friends_only';

COMMENT ON COLUMN public.profiles.messenger_direct_call_policy IS
  '1:1 CM 통화 수신 정책: everybody | friends_only | nobody (default friends_only)';
