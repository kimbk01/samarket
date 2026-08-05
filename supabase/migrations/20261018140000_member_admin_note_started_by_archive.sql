-- Phase 3: Inquiry vs Inbox on same notes table (no new Inbox table).
-- started_by: member = Inquiry, admin = Inbox (Admin → one member).
-- member_archived_at: member soft-archive (hide from member lists).
BEGIN;

ALTER TABLE public.member_admin_note_threads
  ADD COLUMN IF NOT EXISTS started_by text NOT NULL DEFAULT 'member';

ALTER TABLE public.member_admin_note_threads
  ADD COLUMN IF NOT EXISTS member_archived_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'member_admin_note_threads_started_by_check'
  ) THEN
    ALTER TABLE public.member_admin_note_threads
      ADD CONSTRAINT member_admin_note_threads_started_by_check
      CHECK (started_by IN ('member', 'admin'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_admin_note_threads_member_kind
  ON public.member_admin_note_threads (member_user_id, started_by, last_message_at DESC)
  WHERE member_archived_at IS NULL;

COMMENT ON COLUMN public.member_admin_note_threads.started_by IS
  'Phase 3 product split: member=Inquiry, admin=Inbox (1:1).';
COMMENT ON COLUMN public.member_admin_note_threads.member_archived_at IS
  'Member soft-archive; NULL = visible in member lists.';

COMMIT;
