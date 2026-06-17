-- Viewer-only direct room hide on block (messages preserved; peer participant untouched)

ALTER TABLE public.community_messenger_participants
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS left_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS blocked_hidden_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_visible_message_id uuid NULL;

COMMENT ON COLUMN public.community_messenger_participants.blocked_hidden_at IS
  'Viewer-only: hide direct room from inbox when viewer blocked peer. Not archive; cleared on unblock.';

COMMENT ON COLUMN public.community_messenger_participants.hidden_at IS
  'Viewer-only optional hide timestamp (non-block).';

COMMENT ON COLUMN public.community_messenger_participants.left_at IS
  'Viewer left the room at (optional; messages preserved).';

CREATE INDEX IF NOT EXISTS community_messenger_participants_user_blocked_hidden_idx
  ON public.community_messenger_participants (user_id, blocked_hidden_at)
  WHERE blocked_hidden_at IS NOT NULL;
