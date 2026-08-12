-- Customer Center Content SSOT: evolve app_notices in place (NOTICE/SYSTEM/MARKETING boards).
-- Physical table name stays app_notices (rename = reopen). Campaigns remain delivery authority.
BEGIN;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS content_type text NOT NULL DEFAULT 'notice';

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS hero_image_url text NULL;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS author_label text NULL;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS published_at timestamptz NULL;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS comment_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS created_by uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_notices_content_type_check'
      AND conrelid = 'public.app_notices'::regclass
  ) THEN
    ALTER TABLE public.app_notices
      ADD CONSTRAINT app_notices_content_type_check
      CHECK (content_type IN ('notice', 'system', 'marketing'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_notices_view_count_nonneg'
      AND conrelid = 'public.app_notices'::regclass
  ) THEN
    ALTER TABLE public.app_notices
      ADD CONSTRAINT app_notices_view_count_nonneg
      CHECK (view_count >= 0);
  END IF;
END $$;

UPDATE public.app_notices
SET
  content_type = COALESCE(NULLIF(trim(content_type), ''), 'notice'),
  published_at = COALESCE(published_at, created_at),
  view_count = COALESCE(view_count, 0),
  comment_enabled = COALESCE(comment_enabled, true)
WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_app_notices_board_list
  ON public.app_notices (content_type, created_at DESC)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_notices_published_window
  ON public.app_notices (content_type, is_active, starts_at, ends_at)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE public.app_notices IS
  'DIBAY Customer Center Content SSOT (board). content_type=notice|system|marketing. Campaigns/Bell are delivery/arrival only — not the board original. Physical rename deferred.';

COMMENT ON COLUMN public.app_notices.content_type IS
  'Board discriminator: notice | system | marketing';

COMMENT ON COLUMN public.app_notices.hero_image_url IS
  'Board detail hero image SSOT (≠ campaign push_image_url / in_app_image_url)';

COMMENT ON COLUMN public.app_notices.author_label IS
  'Member-facing author override; null → type default (운영팀/시스템/DIBAY)';

COMMIT;
