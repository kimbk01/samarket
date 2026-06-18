-- DIBAY block SSOT — soft unblock + metadata (Kakao-style)
-- SSOT: user_social_relations (relation_type=blocked, is_active=true)
-- participant blocked_hidden_at = UI hide only (not permission)

-- block_source/block_reason — 20260619140000 선행 없이 단독 실행 가능
ALTER TABLE public.user_social_relations
  ADD COLUMN IF NOT EXISTS block_source text;

ALTER TABLE public.user_social_relations
  ADD COLUMN IF NOT EXISTS block_reason text;

ALTER TABLE public.user_social_relations
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_social_relations
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz;

ALTER TABLE public.user_social_relations
  ADD COLUMN IF NOT EXISTS unblocked_at timestamptz;

ALTER TABLE public.user_social_relations
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz;

UPDATE public.user_social_relations
SET blocked_at = COALESCE(blocked_at, created_at),
    last_action_at = COALESCE(last_action_at, updated_at, created_at)
WHERE relation_type = 'blocked';

ALTER TABLE public.user_social_relations
  DROP CONSTRAINT IF EXISTS user_social_relations_block_source_check;

ALTER TABLE public.user_social_relations
  ADD CONSTRAINT user_social_relations_block_source_check
  CHECK (
    block_source IS NULL
    OR block_source IN ('friend_list', 'chat_room', 'profile', 'incoming_call', 'call_log')
  );

COMMENT ON COLUMN public.user_social_relations.is_active IS
  'blocked row: true=차단 중, false=해제됨(이력 유지). friend row는 항상 true.';
COMMENT ON COLUMN public.user_social_relations.blocked_at IS
  'blocked row — 최근 차단 시각';
COMMENT ON COLUMN public.user_social_relations.unblocked_at IS
  'blocked row — 해제 시각 (is_active=false)';
COMMENT ON COLUMN public.user_social_relations.last_action_at IS
  'blocked row — block/unblock 마지막 액션 시각';

CREATE INDEX IF NOT EXISTS user_social_relations_owner_blocked_active_idx
  ON public.user_social_relations (owner_user_id, relation_type, is_active)
  WHERE relation_type = 'blocked';
