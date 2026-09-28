-- DIBAY Intro full product schema. New authority only.
-- Do not read archived intro_show_* / opening_* / intro_v2 / intro_v3 as product SSOT.
-- Scenes and layers live in versioned JSON documents, not exploded tables.

BEGIN;

CREATE TABLE public.dibay_intros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE TABLE public.dibay_intro_documents (
  intro_id uuid PRIMARY KEY REFERENCES public.dibay_intros (id) ON DELETE CASCADE,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT dibay_intro_documents_scenes_array CHECK (jsonb_typeof(document -> 'scenes') = 'array'),
  CONSTRAINT dibay_intro_documents_version CHECK ((document ->> 'version') = '1')
);

CREATE TABLE public.dibay_intro_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intro_id uuid NOT NULL REFERENCES public.dibay_intros (id) ON DELETE CASCADE,
  document jsonb NOT NULL,
  document_checksum text NOT NULL,
  engine_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT dibay_intro_revisions_scenes_array CHECK (jsonb_typeof(document -> 'scenes') = 'array'),
  CONSTRAINT dibay_intro_revisions_version CHECK ((document ->> 'version') = '1')
);

CREATE UNIQUE INDEX dibay_intro_revisions_intro_checksum_uidx
  ON public.dibay_intro_revisions (intro_id, document_checksum);

CREATE TABLE public.dibay_intro_live (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  intro_id uuid NOT NULL REFERENCES public.dibay_intros (id) ON DELETE RESTRICT,
  revision_id uuid NOT NULL REFERENCES public.dibay_intro_revisions (id) ON DELETE RESTRICT,
  set_live_at timestamptz NOT NULL DEFAULT now(),
  set_live_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE TABLE public.dibay_intro_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intro_id uuid NOT NULL REFERENCES public.dibay_intros (id) ON DELETE CASCADE,
  original_name text NOT NULL DEFAULT '',
  mime text NOT NULL,
  byte_size bigint NOT NULL DEFAULT 0,
  width int,
  height int,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'failed')),
  source_path text,
  runtime_path text,
  checksum text,
  animated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ready_at timestamptz
);

CREATE INDEX dibay_intro_media_intro_idx ON public.dibay_intro_media (intro_id, created_at DESC);
CREATE INDEX dibay_intros_updated_idx ON public.dibay_intros (updated_at DESC);
CREATE INDEX dibay_intro_revisions_intro_idx ON public.dibay_intro_revisions (intro_id, created_at DESC);

ALTER TABLE public.dibay_intros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dibay_intro_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dibay_intro_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dibay_intro_live ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dibay_intro_media ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.dibay_intros FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dibay_intro_documents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dibay_intro_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dibay_intro_live FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.dibay_intro_media FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.dibay_intros TO service_role;
GRANT ALL ON TABLE public.dibay_intro_documents TO service_role;
GRANT ALL ON TABLE public.dibay_intro_revisions TO service_role;
GRANT ALL ON TABLE public.dibay_intro_live TO service_role;
GRANT ALL ON TABLE public.dibay_intro_media TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('dibay-intro', 'dibay-intro', false, 52428800)
ON CONFLICT (id) DO NOTHING;

COMMIT;
