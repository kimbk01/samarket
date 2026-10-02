-- Rollback WP-2 / CALL-03
BEGIN;
GRANT INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  public.community_messenger_call_sessions,
  public.community_messenger_call_logs,
  public.community_messenger_call_session_participants,
  public.community_messenger_call_events,
  public.community_messenger_call_signals
  TO anon, authenticated;
COMMIT;
