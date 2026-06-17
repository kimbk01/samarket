-- Telegram-style mutual friendship SSOT for Community Messenger
-- Replaces directional user_social_relations friend rows for CM friend list / requests.

CREATE TABLE IF NOT EXISTS public.community_messenger_friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked', 'removed')),
  blocked_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  blocked_at timestamptz,
  unblocked_at timestamptz,
  readd_blocked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_user_id <> addressee_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS community_messenger_friendships_pair_uidx
  ON public.community_messenger_friendships (
    LEAST(requester_user_id, addressee_user_id),
    GREATEST(requester_user_id, addressee_user_id)
  );

CREATE INDEX IF NOT EXISTS community_messenger_friendships_requester_status_idx
  ON public.community_messenger_friendships (requester_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS community_messenger_friendships_addressee_status_idx
  ON public.community_messenger_friendships (addressee_user_id, status, updated_at DESC);

COMMENT ON TABLE public.community_messenger_friendships IS
  'CM mutual friendship SSOT — pending/accepted/blocked/removed. Unblock does not auto-restore accepted.';

ALTER TABLE public.community_messenger_friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_messenger_friendships_participant ON public.community_messenger_friendships;
CREATE POLICY community_messenger_friendships_participant ON public.community_messenger_friendships
  FOR SELECT
  USING (
    auth.uid() = requester_user_id
    OR auth.uid() = addressee_user_id
  );

DROP POLICY IF EXISTS community_messenger_friendships_participant_write ON public.community_messenger_friendships;
CREATE POLICY community_messenger_friendships_participant_write ON public.community_messenger_friendships
  FOR ALL
  USING (
    auth.uid() = requester_user_id
    OR auth.uid() = addressee_user_id
  )
  WITH CHECK (
    auth.uid() = requester_user_id
    OR auth.uid() = addressee_user_id
  );
