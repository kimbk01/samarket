-- Support admin console — reply edit / delete (Owner-approved 2026-10-05).
-- Admin may edit or delete ONLY their own messages. Nothing is physically removed:
--   * edit   → body replaced, edited_at set, previous body kept in support_case_events (message_edited)
--   * delete → deleted_at set, body kept for audit; customer API masks it as "삭제된 메시지"
-- No new status, no new table. Writes stay service_role only (existing RLS unchanged).

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.support_messages.edited_at IS
  'Admin edited own message (previous body in support_case_events.message_edited).';
COMMENT ON COLUMN public.support_messages.deleted_at IS
  'Admin deleted own message (soft; body retained for audit, masked on customer API).';
