-- PHASE C: crawler durable media authority (pre-publish only).
-- Published post media rows remain post-owned and are not written here.
-- Rehost only when source.media_policy = MEDIA_ALLOWED.

CREATE TABLE IF NOT EXISTS public.community_crawl_item_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crawl_item_id uuid NOT NULL REFERENCES public.community_crawl_items (id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.community_crawl_sources (id) ON DELETE SET NULL,
  board_id uuid REFERENCES public.community_crawl_boards (id) ON DELETE SET NULL,
  source_url text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'post-images',
  storage_path text NOT NULL,
  public_url text,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  role text NOT NULL,
  content_hash text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_crawl_item_media_role_check CHECK (role IN ('COVER', 'BODY'))
);

COMMENT ON TABLE public.community_crawl_item_media IS
  'Crawler durable rehosted media. Publish materializes into post-owned image rows in PHASE F only.';

CREATE UNIQUE INDEX IF NOT EXISTS community_crawl_item_media_item_role_hash_uidx
  ON public.community_crawl_item_media (crawl_item_id, role, content_hash);

CREATE UNIQUE INDEX IF NOT EXISTS community_crawl_item_media_one_current_cover_uidx
  ON public.community_crawl_item_media (crawl_item_id)
  WHERE role = 'COVER' AND is_current = true;

CREATE INDEX IF NOT EXISTS community_crawl_item_media_item_role_idx
  ON public.community_crawl_item_media (crawl_item_id, role, sort_order ASC)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS community_crawl_item_media_hash_idx
  ON public.community_crawl_item_media (content_hash);

ALTER TABLE public.community_crawl_item_media ENABLE ROW LEVEL SECURITY;
