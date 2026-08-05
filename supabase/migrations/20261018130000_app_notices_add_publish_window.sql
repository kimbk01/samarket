-- Phase 2 Runtime fix: existing app_notices may predate publish window columns.
-- CREATE TABLE IF NOT EXISTS does not add columns to an already-present table.
BEGIN;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS starts_at timestamptz NULL;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS ends_at timestamptz NULL;

COMMIT;
