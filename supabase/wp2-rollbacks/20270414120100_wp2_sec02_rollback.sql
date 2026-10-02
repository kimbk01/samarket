-- Rollback WP-2 / SEC-02
BEGIN;
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname='public'
      AND tablename LIKE 'community_messenger%'
      AND tablename NOT LIKE 'community_messenger_call%'
      AND tablename NOT IN ('community_messenger_participants','community_messenger_presence_snapshots')
  LOOP
    EXECUTE format('GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I TO anon, authenticated', t);
  END LOOP;
END $$;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.notification_events, public.user_devices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.community_messenger_presence_snapshots TO anon;
COMMIT;
