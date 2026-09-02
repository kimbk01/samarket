-- PHASE 3-A — Support semantic authority foundation
-- Adds: issue_type + handoff guidance fields on support_cases
-- Adds: support_guidance_entries (not app_notices)
-- Does NOT add: is_pre_handling, new status, new reference types, WAITING_CUSTOMER

BEGIN;

-- ---------------------------------------------------------------------------
-- support_cases: structured classification / guidance handoff
-- Historical rows remain NULL (no backfill guesses).
-- ---------------------------------------------------------------------------
ALTER TABLE public.support_cases
  ADD COLUMN IF NOT EXISTS issue_type text NULL;

ALTER TABLE public.support_cases
  ADD COLUMN IF NOT EXISTS initial_summary text NULL;

ALTER TABLE public.support_cases
  ADD COLUMN IF NOT EXISTS guidance_key text NULL;

ALTER TABLE public.support_cases
  ADD COLUMN IF NOT EXISTS guidance_revision integer NULL;

ALTER TABLE public.support_cases
  ADD COLUMN IF NOT EXISTS guidance_outcome text NULL;

COMMENT ON COLUMN public.support_cases.issue_type IS
  'PHASE 3-A structured issue under category registry. NULL = historical or contextual-compat open.';
COMMENT ON COLUMN public.support_cases.initial_summary IS
  'Optional customer summary captured at structured open.';
COMMENT ON COLUMN public.support_cases.guidance_key IS
  'support_guidance_entries.id used at handoff (stable key).';
COMMENT ON COLUMN public.support_cases.guidance_revision IS
  'Revision of guidance entry at handoff time.';
COMMENT ON COLUMN public.support_cases.guidance_outcome IS
  'RESOLVED_BY_GUIDANCE | ESCALATED_TO_HUMAN | SKIPPED';

CREATE INDEX IF NOT EXISTS idx_support_cases_category_issue
  ON public.support_cases (category, issue_type)
  WHERE issue_type IS NOT NULL;

-- ---------------------------------------------------------------------------
-- support_guidance_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.support_guidance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL CHECK (audience IN ('MEMBER', 'OWNER')),
  category text NOT NULL,
  issue_type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  cta_kind text NOT NULL DEFAULT 'NONE'
    CHECK (cta_kind IN ('NONE', 'INTERNAL_ROUTE', 'DOMAIN_ENTITY')),
  cta_target text NULL,
  escalation_allowed boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_guidance_cta_shape CHECK (
    (cta_kind = 'NONE' AND (cta_target IS NULL OR length(trim(cta_target)) = 0))
    OR (cta_kind <> 'NONE' AND cta_target IS NOT NULL AND length(trim(cta_target)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_support_guidance_lookup
  ON public.support_guidance_entries (audience, category, issue_type, enabled, sort_order);

CREATE INDEX IF NOT EXISTS idx_support_guidance_enabled
  ON public.support_guidance_entries (enabled, updated_at DESC);

COMMENT ON TABLE public.support_guidance_entries IS
  'PHASE 3-A Support guidance SSOT. Not app_notices. Writes via service_role Admin APIs.';

ALTER TABLE public.support_guidance_entries ENABLE ROW LEVEL SECURITY;

-- Customer/authenticated: read enabled rows only (prefer server path; RLS is belt).
DROP POLICY IF EXISTS support_guidance_entries_select_enabled ON public.support_guidance_entries;
CREATE POLICY support_guidance_entries_select_enabled
  ON public.support_guidance_entries
  FOR SELECT
  TO authenticated
  USING (enabled = true OR public.is_platform_admin(auth.uid()));

-- No direct client INSERT/UPDATE/DELETE — Admin writes use service_role.
DROP POLICY IF EXISTS support_guidance_entries_admin_select_all ON public.support_guidance_entries;
CREATE POLICY support_guidance_entries_admin_select_all
  ON public.support_guidance_entries
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

COMMIT;
