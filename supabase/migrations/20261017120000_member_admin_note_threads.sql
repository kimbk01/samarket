-- Member ↔ Admin 쪽지 (일반 회원). Store platform_admin_inquiries 와 분리.
-- Bell: admin→member message creates notification_events admin_notice (campaignType system).

CREATE TABLE IF NOT EXISTS public.member_admin_note_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  member_unread_count integer NOT NULL DEFAULT 0
    CHECK (member_unread_count >= 0),
  admin_unread_count integer NOT NULL DEFAULT 0
    CHECK (admin_unread_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_admin_note_threads_member_last
  ON public.member_admin_note_threads (member_user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_admin_note_threads_admin_unread
  ON public.member_admin_note_threads (admin_unread_count DESC, last_message_at DESC)
  WHERE admin_unread_count > 0;

CREATE TABLE IF NOT EXISTS public.member_admin_note_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.member_admin_note_threads(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('member', 'admin')),
  sender_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_admin_note_messages_thread_created
  ON public.member_admin_note_messages (thread_id, created_at ASC);

COMMENT ON TABLE public.member_admin_note_threads IS
  'General member ↔ DIBAY admin note threads (not store platform_admin_inquiries).';
COMMENT ON TABLE public.member_admin_note_messages IS
  'Messages for member_admin_note_threads.';
