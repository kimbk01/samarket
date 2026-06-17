-- CM social graph: 단방향 friend 저장 + blocked (Telegram-style contacts, not approval-based)
-- community_friend_requests 는 archive only — 앱 코드에서 참조 금지

CREATE TABLE IF NOT EXISTS public.user_social_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  relation_type text NOT NULL CHECK (relation_type IN ('friend', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, target_user_id),
  CHECK (owner_user_id <> target_user_id)
);

CREATE INDEX IF NOT EXISTS user_social_relations_owner_type_idx
  ON public.user_social_relations (owner_user_id, relation_type, created_at DESC);

CREATE INDEX IF NOT EXISTS user_social_relations_target_type_idx
  ON public.user_social_relations (target_user_id, relation_type);

COMMENT ON TABLE public.user_social_relations IS
  'CM 1:1 social graph — friend=내 연락처 저장(단방향), blocked=내 기준 차단. community_friend_requests 대체.';

COMMENT ON TABLE public.community_friend_requests IS
  'DEPRECATED — archive only. Use user_social_relations. Do not insert/update from app.';

-- blocked 우선: blocked INSERT/UPDATE 시 동일 pair friend 제거
CREATE OR REPLACE FUNCTION public.user_social_relations_blocked_clears_friend()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.relation_type = 'blocked' THEN
    DELETE FROM public.user_social_relations
    WHERE owner_user_id = NEW.owner_user_id
      AND target_user_id = NEW.target_user_id
      AND relation_type = 'friend';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_social_relations_blocked_clears_friend ON public.user_social_relations;
CREATE TRIGGER trg_user_social_relations_blocked_clears_friend
  BEFORE INSERT OR UPDATE OF relation_type ON public.user_social_relations
  FOR EACH ROW
  EXECUTE FUNCTION public.user_social_relations_blocked_clears_friend();

ALTER TABLE public.user_social_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_social_relations_own ON public.user_social_relations;
CREATE POLICY user_social_relations_own ON public.user_social_relations
  FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);

-- 통화 프라이버시 (1:1 direct call)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS messenger_direct_call_policy text;

UPDATE public.profiles
SET messenger_direct_call_policy = 'everyone'
WHERE messenger_direct_call_policy IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN messenger_direct_call_policy SET DEFAULT 'everyone';

ALTER TABLE public.profiles
  ALTER COLUMN messenger_direct_call_policy SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_messenger_direct_call_policy_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_messenger_direct_call_policy_check
  CHECK (messenger_direct_call_policy IN ('everyone', 'friends_only', 'none'));

COMMENT ON COLUMN public.profiles.messenger_direct_call_policy IS
  '1:1 CM 통화 수신 정책: everyone | friends_only | none';

-- 이관: accepted friend → 양방향 friend 저장 (A→B, B→A)
INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, created_at, updated_at)
SELECT fr.requester_id, fr.addressee_id, 'friend', COALESCE(fr.responded_at, fr.created_at), COALESCE(fr.responded_at, fr.created_at)
FROM public.community_friend_requests fr
WHERE fr.status = 'accepted'
ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
  SET relation_type = EXCLUDED.relation_type,
      updated_at = GREATEST(user_social_relations.updated_at, EXCLUDED.updated_at)
  WHERE user_social_relations.relation_type <> 'blocked';

INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, created_at, updated_at)
SELECT fr.addressee_id, fr.requester_id, 'friend', COALESCE(fr.responded_at, fr.created_at), COALESCE(fr.responded_at, fr.created_at)
FROM public.community_friend_requests fr
WHERE fr.status = 'accepted'
ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
  SET relation_type = EXCLUDED.relation_type,
      updated_at = GREATEST(user_social_relations.updated_at, EXCLUDED.updated_at)
  WHERE user_social_relations.relation_type <> 'blocked';

-- 이관: user_relationships blocked → user_social_relations blocked
INSERT INTO public.user_social_relations (owner_user_id, target_user_id, relation_type, created_at, updated_at)
SELECT ur.user_id, ur.target_user_id, 'blocked', ur.created_at, ur.created_at
FROM public.user_relationships ur
WHERE ur.relation_type = 'blocked' OR ur.type = 'blocked'
ON CONFLICT (owner_user_id, target_user_id) DO UPDATE
  SET relation_type = 'blocked',
      updated_at = GREATEST(user_social_relations.updated_at, EXCLUDED.updated_at);

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RETURN;
  END IF;
  IF to_regclass('public.user_social_relations') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'user_social_relations'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_social_relations;
  END IF;
END $$;
