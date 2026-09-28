-- NEW Opening publish authority.
-- Draft stays in opening_drafts. Runtime reads LIVE revision only.
-- OLD intro_* publication is not reused.

BEGIN;

CREATE TABLE IF NOT EXISTS public.opening_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL REFERENCES public.opening_shows (id) ON DELETE CASCADE,
  revision_number integer NOT NULL CHECK (revision_number >= 1),
  payload jsonb NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT opening_revisions_show_number_unique UNIQUE (show_id, revision_number)
);

COMMENT ON TABLE public.opening_revisions IS
  'Immutable published Opening snapshot. Not intro publications. Draft is never this table.';

ALTER TABLE public.opening_shows
  ADD COLUMN IF NOT EXISTS live_revision_id uuid NULL REFERENCES public.opening_revisions (id);

CREATE UNIQUE INDEX IF NOT EXISTS opening_shows_one_live
  ON public.opening_shows ((true))
  WHERE live_revision_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS opening_revisions_show_id_idx
  ON public.opening_revisions (show_id, revision_number DESC);

ALTER TABLE public.opening_media_derivatives
  DROP CONSTRAINT IF EXISTS opening_media_derivatives_kind_check;

ALTER TABLE public.opening_media_derivatives
  ADD CONSTRAINT opening_media_derivatives_kind_check
  CHECK (kind IN ('display', 'thumb', 'runtimeDisplay'));

ALTER TABLE public.opening_revisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.opening_revisions FROM PUBLIC;
REVOKE ALL ON TABLE public.opening_revisions FROM anon, authenticated;
GRANT SELECT ON TABLE public.opening_revisions TO authenticated;
GRANT ALL ON TABLE public.opening_revisions TO service_role;

DROP POLICY IF EXISTS opening_revisions_admin_select ON public.opening_revisions;
CREATE POLICY opening_revisions_admin_select
  ON public.opening_revisions
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.set_opening_live(p_show_id uuid, p_revision_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.opening_revisions
    WHERE id = p_revision_id
      AND show_id = p_show_id
  ) THEN
    RAISE EXCEPTION 'opening_live_revision_mismatch';
  END IF;
  UPDATE public.opening_shows
  SET live_revision_id = NULL
  WHERE live_revision_id IS NOT NULL;
  UPDATE public.opening_shows
  SET live_revision_id = p_revision_id, updated_at = now()
  WHERE id = p_show_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_opening_live(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_opening_live(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_opening_live(uuid, uuid) TO service_role;

COMMIT;
