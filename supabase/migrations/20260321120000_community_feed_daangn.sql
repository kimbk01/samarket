-- SAMarket community feed (dongnae section seed + tables)
-- Paste in Supabase SQL Editor -> Run (full script)

-- admin_settings (shared)
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key text PRIMARY KEY,
  value_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_sections_slug_key UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_community_sections_active_sort
  ON public.community_sections (is_active, sort_order);

CREATE TABLE IF NOT EXISTS public.community_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.community_sections (id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  color text,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_visible boolean NOT NULL DEFAULT true,
  is_feed_sort boolean NOT NULL DEFAULT false,
  allow_question boolean NOT NULL DEFAULT false,
  allow_meetup boolean NOT NULL DEFAULT false,
  feed_list_skin text NOT NULL DEFAULT 'compact_media',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_topics_section_slug_key UNIQUE (section_id, slug),
  CONSTRAINT community_topics_feed_list_skin_check CHECK (
    feed_list_skin IN (
      'compact_media',
      'text_primary',
      'location_pin',
      'hashtags_below'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_community_topics_section
  ON public.community_topics (section_id, is_active, is_visible, sort_order);

CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.community_sections (id) ON DELETE RESTRICT,
  section_slug text NOT NULL,
  topic_id uuid NOT NULL REFERENCES public.community_topics (id) ON DELETE RESTRICT,
  topic_slug text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  summary text,
  region_label text NOT NULL DEFAULT 'Malate',
  is_question boolean NOT NULL DEFAULT false,
  is_meetup boolean NOT NULL DEFAULT false,
  meetup_place text,
  meetup_date timestamptz,
  view_count int NOT NULL DEFAULT 0,
  like_count int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,
  report_count int NOT NULL DEFAULT 0,
  is_hidden boolean NOT NULL DEFAULT false,
  source_legacy_post_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT community_posts_like_count_check CHECK (like_count >= 0),
  CONSTRAINT community_posts_comment_count_check CHECK (comment_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS community_posts_source_legacy_post_id_key
  ON public.community_posts (source_legacy_post_id)
  WHERE source_legacy_post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_posts_feed
  ON public.community_posts (section_slug, is_hidden, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_topic
  ON public.community_posts (section_slug, topic_slug, is_hidden, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_posts_user_created
  ON public.community_posts (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.community_post_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  image_url text NOT NULL,
  storage_path text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_post_images_post
  ON public.community_post_images (post_id, sort_order);

CREATE TABLE IF NOT EXISTS public.community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.community_comments (id) ON DELETE SET NULL,
  content text NOT NULL,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_comments_post
  ON public.community_comments (post_id, is_hidden, created_at);

CREATE TABLE IF NOT EXISTS public.community_post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_likes_post_user_key UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_post_likes_user
  ON public.community_post_likes (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id text NOT NULL,
  reporter_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  reason_type text NOT NULL,
  reason_text text,
  status text NOT NULL DEFAULT 'open',
  admin_memo text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_reports_created
  ON public.community_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_reports_status
  ON public.community_reports (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.community_post_bump_like_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts
    SET like_count = like_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$func$;

DROP TRIGGER IF EXISTS tr_community_post_likes_bump ON public.community_post_likes;
CREATE TRIGGER tr_community_post_likes_bump
  AFTER INSERT OR DELETE ON public.community_post_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.community_post_bump_like_count();

CREATE OR REPLACE FUNCTION public.community_post_bump_comment_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts
    SET comment_count = comment_count + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts
    SET comment_count = GREATEST(0, comment_count - 1)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$func$;

DROP TRIGGER IF EXISTS tr_community_comments_bump ON public.community_comments;
CREATE TRIGGER tr_community_comments_bump
  AFTER INSERT OR DELETE ON public.community_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.community_post_bump_comment_count();

ALTER TABLE public.community_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_reports ENABLE ROW LEVEL SECURITY;

INSERT INTO public.community_sections (name, slug, sort_order, is_active)
VALUES ('동네생활', 'dongnae', 0, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.community_topics (
  section_id, name, slug, sort_order, is_active, is_visible,
  is_feed_sort, allow_question, allow_meetup, feed_list_skin
)
SELECT id, '자유게시판', 'free', 1, true, true, false, true, true, 'compact_media'
FROM public.community_sections WHERE slug = 'dongnae'
ON CONFLICT (section_id, slug) DO NOTHING;

INSERT INTO public.community_topics (
  section_id, name, slug, sort_order, is_active, is_visible,
  is_feed_sort, allow_question, allow_meetup, feed_list_skin
)
SELECT id, '질문있어요', 'question', 2, true, true, false, true, false, 'text_primary'
FROM public.community_sections WHERE slug = 'dongnae'
ON CONFLICT (section_id, slug) DO NOTHING;

INSERT INTO public.community_topics (
  section_id, name, slug, sort_order, is_active, is_visible,
  is_feed_sort, allow_question, allow_meetup, feed_list_skin
)
SELECT id, '모임/소모임', 'meetup', 3, true, true, false, false, true, 'location_pin'
FROM public.community_sections WHERE slug = 'dongnae'
ON CONFLICT (section_id, slug) DO NOTHING;

INSERT INTO public.community_topics (
  section_id, name, slug, sort_order, is_active, is_visible,
  is_feed_sort, allow_question, allow_meetup, feed_list_skin
)
SELECT id, '인기글', 'popular', 0, true, true, true, false, false, 'compact_media'
FROM public.community_sections WHERE slug = 'dongnae'
ON CONFLICT (section_id, slug) DO NOTHING;

INSERT INTO public.community_topics (
  section_id, name, slug, sort_order, is_active, is_visible,
  is_feed_sort, allow_question, allow_meetup, feed_list_skin
)
SELECT id, '추천', 'recommended', 4, true, true, true, false, false, 'hashtags_below'
FROM public.community_sections WHERE slug = 'dongnae'
ON CONFLICT (section_id, slug) DO NOTHING;

INSERT INTO public.admin_settings (key, value_json, updated_at)
VALUES (
  'community_feed_ops',
  jsonb_build_object(
    'banned_words', '[]'::jsonb,
    'max_title_length', 200,
    'max_content_length', 20000,
    'max_comment_length', 4000,
    'max_posts_per_day', 50,
    'min_comment_interval_sec', 0
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;
