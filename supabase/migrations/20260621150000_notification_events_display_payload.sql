-- P0.5 Phase 1: rich notification display SSOT (nullable for existing rows).

ALTER TABLE public.notification_events
  ADD COLUMN IF NOT EXISTS display_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.notification_events.display_payload IS
  'P0.5 message notification display — sender, preview, room context for push/in-app (title/body mirror).';
