-- Rollback WP-2 / SEC-01
BEGIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.community_messenger_participants TO anon, authenticated;
COMMIT;
