-- Scope B WP4 — Event board (/events) columns on platform_events.
-- Inspected production schema (2026-10-19): none of these columns existed.
-- Idempotent. App code tolerates their absence (select / write fallback) until applied.
--
-- thumbnail_url : 2:1 board card image (falls back to hero_image_url when null)
-- sort_order    : board order (ascending) after pinned
-- is_pinned     : pinned to the top of the board
-- category      : free-form short label shown on the card
-- archived_at   : archived events never appear publicly (board / detail); archive also sets
--                 status = 'unpublished' in the app so status-only gates stop distributing.
--
-- Rollback:
--   DROP POLICY IF EXISTS platform_events_public_select ON public.platform_events;
--   CREATE POLICY platform_events_public_select ON public.platform_events FOR SELECT
--     TO anon, authenticated USING (status = 'published'
--     AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()));
--   DROP INDEX IF EXISTS public.platform_events_board_order_idx;
--   ALTER TABLE public.platform_events
--     DROP CONSTRAINT IF EXISTS platform_events_category_len_chk,
--     DROP CONSTRAINT IF EXISTS platform_events_thumbnail_url_https_chk,
--     DROP COLUMN IF EXISTS archived_at,
--     DROP COLUMN IF EXISTS category,
--     DROP COLUMN IF EXISTS is_pinned,
--     DROP COLUMN IF EXISTS sort_order,
--     DROP COLUMN IF EXISTS thumbnail_url;

ALTER TABLE public.platform_events
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.platform_events'::regclass
      AND conname = 'platform_events_category_len_chk'
  ) THEN
    ALTER TABLE public.platform_events
      ADD CONSTRAINT platform_events_category_len_chk
      CHECK (category IS NULL OR char_length(category) <= 40);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.platform_events'::regclass
      AND conname = 'platform_events_thumbnail_url_https_chk'
  ) THEN
    ALTER TABLE public.platform_events
      ADD CONSTRAINT platform_events_thumbnail_url_https_chk
      CHECK (thumbnail_url IS NULL OR thumbnail_url ~* '^https://');
  END IF;
END $$;

-- Public board read: published + not archived, ordered pinned → sort_order → start desc.
CREATE INDEX IF NOT EXISTS platform_events_board_order_idx
  ON public.platform_events (is_pinned DESC, sort_order ASC, starts_at DESC)
  WHERE status = 'published' AND archived_at IS NULL;

-- Direct client reads (RLS) must not see archived rows either.
DROP POLICY IF EXISTS platform_events_public_select ON public.platform_events;
CREATE POLICY platform_events_public_select ON public.platform_events
  FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    AND archived_at IS NULL
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

COMMENT ON COLUMN public.platform_events.archived_at IS
  'Event board archive — archived events are hidden from /events and Event Detail.';
