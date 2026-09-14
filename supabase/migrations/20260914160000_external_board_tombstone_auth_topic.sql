-- External board: publication tombstone + source auth session (no plaintext passwords).
-- Reuses external_board_articles identity UNIQUE (source_id, stable_article_identity).

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'none'
    CHECK (publication_state IN (
      'none',
      'published',
      'hidden',
      'deleted',
      'suppressed',
      'republish_allowed'
    ));

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS suppressed_at timestamptz NULL;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS suppression_reason text NULL;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS suppression_actor_id uuid NULL;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS source_category text NULL;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS source_section text NULL;

ALTER TABLE public.external_board_articles
  ADD COLUMN IF NOT EXISTS source_tags jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.external_board_articles.publication_state IS
  'Tombstone/republish authority. deleted/suppressed/hidden block republish until republish_allowed.';
COMMENT ON COLUMN public.external_board_articles.source_category IS
  'Raw external taxonomy only — never auto-creates community_topics.';

-- Backfill linked posts from community_posts.status (never force hidden→published).
UPDATE public.external_board_articles AS a
SET
  publication_state = CASE
    WHEN p.status = 'hidden' THEN 'hidden'
    WHEN p.status = 'deleted' THEN 'deleted'
    ELSE 'published'
  END,
  suppressed_at = CASE
    WHEN p.status IN ('hidden', 'deleted') THEN now()
    ELSE NULL
  END,
  suppression_reason = CASE
    WHEN p.status IN ('hidden', 'deleted') THEN 'migration_backfill_community_status'
    ELSE NULL
  END
FROM public.community_posts AS p
WHERE a.published_post_id = p.id
  AND a.publication_state = 'none';

-- Orphan published_post_id (post row gone) → deleted tombstone, identity retained.
UPDATE public.external_board_articles AS a
SET
  publication_state = 'deleted',
  suppressed_at = now(),
  suppression_reason = 'migration_backfill_orphan_published_post'
WHERE a.published_post_id IS NOT NULL
  AND a.publication_state = 'none'
  AND NOT EXISTS (
    SELECT 1 FROM public.community_posts AS p WHERE p.id = a.published_post_id
  );

ALTER TABLE public.external_board_sources
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'public'
    CHECK (auth_mode IN ('public', 'login_required', 'session_required'));

CREATE TABLE IF NOT EXISTS public.external_board_source_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.external_board_sources(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'login_required'
    CHECK (status IN ('login_required', 'authenticated', 'expired', 'failed')),
  -- Opaque vault/ref only. NEVER store username/password plaintext here.
  credential_ref text NULL,
  authenticated_at timestamptz NULL,
  expires_at timestamptz NULL,
  last_verified_at timestamptz NULL,
  failure_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_board_source_sessions_source_uidx UNIQUE (source_id)
);

COMMENT ON TABLE public.external_board_source_sessions IS
  'Server-side source auth session refs. No plaintext passwords. No CAPTCHA/CF bypass.';

CREATE INDEX IF NOT EXISTS external_board_articles_publication_state_idx
  ON public.external_board_articles (source_id, publication_state);
