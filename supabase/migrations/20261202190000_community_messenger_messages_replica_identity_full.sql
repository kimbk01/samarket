-- Messenger same-id UPDATE propagation: ensure Realtime UPDATE payloads include full row
-- (metadata jsonb etc.). DEFAULT replica identity can omit columns peers need for merge.
-- Safe / idempotent: ALTER REPLICA IDENTITY FULL is metadata-only (no data rewrite).

ALTER TABLE public.community_messenger_messages REPLICA IDENTITY FULL;
