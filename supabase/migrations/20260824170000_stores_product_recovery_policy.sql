-- Product recovery — HOME shelf product meta + CATEGORY browse scope policy.

BEGIN;

ALTER TABLE public.store_composition_policy_overrides
  ADD COLUMN IF NOT EXISTS title_ko text,
  ADD COLUMN IF NOT EXISTS title_en text,
  ADD COLUMN IF NOT EXISTS subtitle_ko text,
  ADD COLUMN IF NOT EXISTS subtitle_en text,
  ADD COLUMN IF NOT EXISTS presentation_mode text,
  ADD COLUMN IF NOT EXISTS coupon_integration text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS ad_integration text NOT NULL DEFAULT 'off',
  ADD COLUMN IF NOT EXISTS schedule_start timestamptz,
  ADD COLUMN IF NOT EXISTS schedule_end timestamptz,
  ADD COLUMN IF NOT EXISTS shelf_id text;

COMMENT ON COLUMN public.store_composition_policy_overrides.shelf_id IS
  'Owner-facing shelf id (stores-home-shelf-product-catalog). slot retained for engine compat.';

CREATE TABLE IF NOT EXISTS public.store_browse_scope_policy (
  scope_key text PRIMARY KEY,
  primary_slug text NOT NULL,
  sub_slug text,
  enabled boolean NOT NULL DEFAULT true,
  display_title_ko text,
  display_title_en text,
  ad_enabled text NOT NULL DEFAULT 'inherit' CHECK (ad_enabled IN ('inherit', 'true', 'false')),
  coupon_enabled text NOT NULL DEFAULT 'inherit' CHECK (coupon_enabled IN ('inherit', 'true', 'false')),
  max_insertion integer CHECK (max_insertion IS NULL OR max_insertion >= 0),
  interval_every_n integer CHECK (interval_every_n IS NULL OR interval_every_n > 0),
  presentation_mode text NOT NULL DEFAULT 'inherit'
    CHECK (presentation_mode IN ('inherit', 'card_benefit_integrated', 'hidden')),
  schedule_start timestamptz,
  schedule_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES auth.users(id),
  CONSTRAINT store_browse_scope_policy_sub_chk CHECK (
    (sub_slug IS NULL AND scope_key = primary_slug)
    OR (sub_slug IS NOT NULL AND scope_key = primary_slug || '/' || sub_slug)
  )
);

CREATE INDEX IF NOT EXISTS idx_store_browse_scope_policy_primary
  ON public.store_browse_scope_policy (primary_slug);

CREATE TABLE IF NOT EXISTS public.store_browse_scope_policy_state (
  id text PRIMARY KEY DEFAULT 'global',
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_browse_scope_policy_state_revision_nonneg CHECK (revision >= 0)
);

INSERT INTO public.store_browse_scope_policy_state (id, revision)
VALUES ('global', 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_store_browse_scope_policy_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_store_browse_scope_policy_updated_at ON public.store_browse_scope_policy;
CREATE TRIGGER trg_store_browse_scope_policy_updated_at
  BEFORE UPDATE ON public.store_browse_scope_policy
  FOR EACH ROW
  EXECUTE FUNCTION public.set_store_browse_scope_policy_updated_at();

CREATE OR REPLACE FUNCTION public.ensure_store_browse_scope_policy_revision()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revision bigint;
BEGIN
  INSERT INTO public.store_browse_scope_policy_state (id, revision)
  VALUES ('global', 0)
  ON CONFLICT (id) DO NOTHING;

  SELECT revision INTO v_revision
  FROM public.store_browse_scope_policy_state
  WHERE id = 'global';

  RETURN COALESCE(v_revision, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_store_browse_scope_policy_cas(
  p_expected_revision bigint,
  p_rows jsonb,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current bigint;
  v_new_revision bigint;
  v_row jsonb;
  v_scope_key text;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_expected_revision');
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_rows');
  END IF;

  INSERT INTO public.store_browse_scope_policy_state (id, revision)
  VALUES ('global', 0)
  ON CONFLICT (id) DO NOTHING;

  SELECT revision INTO v_current
  FROM public.store_browse_scope_policy_state
  WHERE id = 'global'
  FOR UPDATE;

  IF v_current IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'stale_revision',
      'current_revision', v_current,
      'expected_revision', p_expected_revision
    );
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    v_scope_key := v_row->>'scopeKey';
    INSERT INTO public.store_browse_scope_policy (
      scope_key,
      primary_slug,
      sub_slug,
      enabled,
      display_title_ko,
      display_title_en,
      ad_enabled,
      coupon_enabled,
      max_insertion,
      interval_every_n,
      presentation_mode,
      schedule_start,
      schedule_end,
      updated_by_user_id
    )
    VALUES (
      v_scope_key,
      v_row->>'primarySlug',
      NULLIF(v_row->>'subSlug', ''),
      COALESCE((v_row->>'enabled')::boolean, true),
      NULLIF(v_row->>'displayTitleKo', ''),
      NULLIF(v_row->>'displayTitleEn', ''),
      COALESCE(v_row->>'adEnabled', 'inherit'),
      COALESCE(v_row->>'couponEnabled', 'inherit'),
      CASE WHEN v_row->>'maxInsertion' IS NULL OR v_row->>'maxInsertion' = 'null' THEN NULL
           ELSE (v_row->>'maxInsertion')::integer END,
      CASE WHEN v_row->>'intervalEveryN' IS NULL OR v_row->>'intervalEveryN' = 'null' THEN NULL
           ELSE (v_row->>'intervalEveryN')::integer END,
      COALESCE(v_row->>'presentationMode', 'inherit'),
      CASE WHEN v_row->>'scheduleStart' IS NULL OR v_row->>'scheduleStart' = 'null' THEN NULL
           ELSE (v_row->>'scheduleStart')::timestamptz END,
      CASE WHEN v_row->>'scheduleEnd' IS NULL OR v_row->>'scheduleEnd' = 'null' THEN NULL
           ELSE (v_row->>'scheduleEnd')::timestamptz END,
      p_actor_id
    )
    ON CONFLICT (scope_key) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      display_title_ko = EXCLUDED.display_title_ko,
      display_title_en = EXCLUDED.display_title_en,
      ad_enabled = EXCLUDED.ad_enabled,
      coupon_enabled = EXCLUDED.coupon_enabled,
      max_insertion = EXCLUDED.max_insertion,
      interval_every_n = EXCLUDED.interval_every_n,
      presentation_mode = EXCLUDED.presentation_mode,
      schedule_start = EXCLUDED.schedule_start,
      schedule_end = EXCLUDED.schedule_end,
      updated_by_user_id = EXCLUDED.updated_by_user_id;
  END LOOP;

  v_new_revision := v_current + 1;
  UPDATE public.store_browse_scope_policy_state
  SET revision = v_new_revision, updated_at = now()
  WHERE id = 'global';

  RETURN jsonb_build_object('ok', true, 'revision', v_new_revision);
END;
$$;

ALTER TABLE public.store_browse_scope_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_browse_scope_policy_state ENABLE ROW LEVEL SECURITY;

COMMIT;
