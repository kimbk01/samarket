-- CM direct call privacy — Kakao-style default everyone (block SSOT 최우선)

UPDATE public.profiles
SET messenger_direct_call_policy = 'everyone'
WHERE messenger_direct_call_policy IS NULL
   OR messenger_direct_call_policy = 'friends_only';

ALTER TABLE public.profiles
  ALTER COLUMN messenger_direct_call_policy SET DEFAULT 'everyone';

COMMENT ON COLUMN public.profiles.messenger_direct_call_policy IS
  '1:1 CM 통화 수신 정책: everyone | friends_only | none (default everyone — 차단은 block SSOT)';

-- 차단 출처·사유 (blocked row 전용, optional)
ALTER TABLE public.user_social_relations
  ADD COLUMN IF NOT EXISTS block_source text
    CHECK (block_source IS NULL OR block_source IN ('chat_room', 'incoming_call', 'profile', 'call_log'));

ALTER TABLE public.user_social_relations
  ADD COLUMN IF NOT EXISTS block_reason text;

COMMENT ON COLUMN public.user_social_relations.block_source IS
  '차단 출처: chat_room | incoming_call | profile | call_log (relation_type=blocked 일 때)';
