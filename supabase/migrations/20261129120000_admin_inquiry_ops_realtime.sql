-- P0-C: AdminOps realtime wake-up for Care + platform inquiry INSERT.
-- Badge/count remains loadAdminActionQueueCounts (status=open). Sound uses row PK dedupe.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'admin_inquiry_rt: supabase_realtime publication missing — skip ADD TABLE';
    RETURN;
  END IF;

  IF to_regclass('public.member_admin_note_threads') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'member_admin_note_threads'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.member_admin_note_threads';
  END IF;

  IF to_regclass('public.platform_admin_inquiries') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'platform_admin_inquiries'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_admin_inquiries';
  END IF;
END $$;

-- Care threads: enable RLS + tight SELECT (admin all; member own)
ALTER TABLE public.member_admin_note_threads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_admin_note_threads_admin_select ON public.member_admin_note_threads;
CREATE POLICY member_admin_note_threads_admin_select
  ON public.member_admin_note_threads
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS member_admin_note_threads_member_select ON public.member_admin_note_threads;
CREATE POLICY member_admin_note_threads_member_select
  ON public.member_admin_note_threads
  FOR SELECT
  TO authenticated
  USING (member_user_id = auth.uid());

-- Platform inquiries: tight Admin SELECT for RT (writes stay service_role)
DROP POLICY IF EXISTS platform_admin_inquiries_admin_select ON public.platform_admin_inquiries;
CREATE POLICY platform_admin_inquiries_admin_select
  ON public.platform_admin_inquiries
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

COMMIT;
