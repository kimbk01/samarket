-- STEP 1: Community imported identity / display author
-- KEEP user_id NOT NULL. Do not alter FK nullability.
-- community_posts.user_id → auth.users ON DELETE CASCADE (baseline).
-- Protection: community_import_principal.user_id REFERENCES auth.users ON DELETE RESTRICT
--   → Auth Admin cannot delete the import principal while the singleton row exists.

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS origin_kind text NOT NULL DEFAULT 'member';

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS display_author_name text;

ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS display_author_avatar_url text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_posts_origin_kind_check'
      AND conrelid = 'public.community_posts'::regclass
  ) THEN
    ALTER TABLE public.community_posts
      ADD CONSTRAINT community_posts_origin_kind_check
      CHECK (origin_kind IN ('member', 'admin', 'imported'));
  END IF;
END $$;

COMMENT ON COLUMN public.community_posts.origin_kind IS
  'Community post origin: member | admin | imported. Existing rows default member.';
COMMENT ON COLUMN public.community_posts.display_author_name IS
  'Imported (and optional admin) display author. Member posts use profiles via user_id.';
COMMENT ON COLUMN public.community_posts.display_author_avatar_url IS
  'Imported display avatar URL (DIBAY storage preferred). Member posts use profiles.';

-- Singleton registry for the Community Import System Principal (exactly one row).
CREATE TABLE IF NOT EXISTS public.community_import_principal (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE RESTRICT,
  label text NOT NULL DEFAULT 'community_import',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_import_principal_label_check CHECK (label = 'community_import')
);

CREATE UNIQUE INDEX IF NOT EXISTS community_import_principal_singleton
  ON public.community_import_principal ((true));

COMMENT ON TABLE public.community_import_principal IS
  'Singleton Community Import System Principal. ON DELETE RESTRICT blocks auth.users delete while registered. Seed via Auth Admin createUser then INSERT here — never mass-create fake members.';

ALTER TABLE public.community_import_principal ENABLE ROW LEVEL SECURITY;
