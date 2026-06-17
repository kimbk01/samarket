-- CM 1:1 unknown peer notice dismiss — friend/blocked 와 분리 (Telegram-style top bar)

CREATE TABLE IF NOT EXISTS public.community_messenger_peer_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  peer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.community_messenger_rooms(id) ON DELETE CASCADE,
  notice_type text NOT NULL CHECK (notice_type IN ('unknown_peer')),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (viewer_user_id, peer_user_id, room_id, notice_type),
  CHECK (viewer_user_id <> peer_user_id)
);

CREATE INDEX IF NOT EXISTS community_messenger_peer_notices_viewer_room_idx
  ON public.community_messenger_peer_notices (viewer_user_id, room_id, notice_type);

COMMENT ON TABLE public.community_messenger_peer_notices IS
  'CM 1:1 room top notice dismiss state — unknown_peer only. Not friend/block; viewer-local UI preference.';

ALTER TABLE public.community_messenger_peer_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_messenger_peer_notices_own ON public.community_messenger_peer_notices;
CREATE POLICY community_messenger_peer_notices_own ON public.community_messenger_peer_notices
  FOR ALL
  USING (auth.uid() = viewer_user_id)
  WITH CHECK (auth.uid() = viewer_user_id);
