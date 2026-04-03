ALTER TABLE public.meeting_open_chat_rooms
  ADD COLUMN IF NOT EXISTS identity_mode text;

UPDATE public.meeting_open_chat_rooms
SET identity_mode = 'nickname_optional'
WHERE identity_mode IS NULL;

ALTER TABLE public.meeting_open_chat_rooms
  ALTER COLUMN identity_mode SET DEFAULT 'realname';

ALTER TABLE public.meeting_open_chat_rooms
  ALTER COLUMN identity_mode SET NOT NULL;

ALTER TABLE public.meeting_open_chat_rooms
  DROP CONSTRAINT IF EXISTS meeting_open_chat_rooms_identity_mode_check;

ALTER TABLE public.meeting_open_chat_rooms
  ADD CONSTRAINT meeting_open_chat_rooms_identity_mode_check
  CHECK (identity_mode IN ('realname', 'nickname_optional'));
