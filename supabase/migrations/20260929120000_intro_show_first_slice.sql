-- DIBAY Intro 9th rebuild — first vertical slice.
-- New product namespace only. Failed vNext tables stay untouched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.intro_show_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.intro_show_drafts (
  campaign_id uuid PRIMARY KEY REFERENCES public.intro_show_campaigns(id) ON DELETE CASCADE,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.intro_show_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.intro_show_campaigns(id) ON DELETE CASCADE,
  document jsonb NOT NULL,
  document_checksum text NOT NULL,
  engine_id text NOT NULL,
  engine_version text NOT NULL,
  engine_hash text NOT NULL,
  pack_checksum text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.intro_show_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.intro_show_campaigns(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('LOGO', 'IMAGE')),
  status text NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  mime_type text,
  width integer,
  height integer,
  byte_size integer,
  checksum text,
  source_storage_key text,
  thumbnail_storage_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public.intro_show_media_assets (
  media_id uuid PRIMARY KEY REFERENCES public.intro_show_media(id) ON DELETE CASCADE,
  runtime_storage_key text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  checksum text NOT NULL,
  byte_size integer NOT NULL,
  ready_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.intro_show_live (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  revision_id uuid NOT NULL REFERENCES public.intro_show_revisions(id),
  campaign_id uuid NOT NULL REFERENCES public.intro_show_campaigns(id),
  set_live_at timestamptz NOT NULL DEFAULT now(),
  set_live_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS intro_show_revisions_campaign_idx
  ON public.intro_show_revisions (campaign_id, published_at DESC);
CREATE INDEX IF NOT EXISTS intro_show_media_campaign_idx
  ON public.intro_show_media (campaign_id, created_at DESC);

ALTER TABLE public.intro_show_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_show_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_show_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_show_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_show_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intro_show_live ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.intro_show_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_show_drafts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_show_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_show_media FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_show_media_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.intro_show_live FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.intro_show_campaigns TO service_role;
GRANT ALL ON TABLE public.intro_show_drafts TO service_role;
GRANT ALL ON TABLE public.intro_show_revisions TO service_role;
GRANT ALL ON TABLE public.intro_show_media TO service_role;
GRANT ALL ON TABLE public.intro_show_media_assets TO service_role;
GRANT ALL ON TABLE public.intro_show_live TO service_role;

CREATE OR REPLACE FUNCTION public.intro_show_set_live(
  p_revision_id uuid,
  p_admin_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  SELECT campaign_id INTO v_campaign_id
  FROM public.intro_show_revisions
  WHERE id = p_revision_id;
  IF v_campaign_id IS NULL THEN
    RAISE EXCEPTION 'intro_show_revision_missing';
  END IF;

  INSERT INTO public.intro_show_live (id, revision_id, campaign_id, set_live_at, set_live_by)
  VALUES (true, p_revision_id, v_campaign_id, now(), p_admin_user_id)
  ON CONFLICT (id) DO UPDATE
    SET revision_id = EXCLUDED.revision_id,
        campaign_id = EXCLUDED.campaign_id,
        set_live_at = EXCLUDED.set_live_at,
        set_live_by = EXCLUDED.set_live_by;

  RETURN p_revision_id;
END;
$$;

REVOKE ALL ON FUNCTION public.intro_show_set_live(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intro_show_set_live(uuid, uuid) TO service_role;

INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
  'intro-show',
  'intro-show',
  false,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']::text[],
  NULL
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = NULL;

COMMIT;
