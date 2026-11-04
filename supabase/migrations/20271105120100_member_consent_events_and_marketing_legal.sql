-- Consent UX SSOT (Owner-approved design 2026-11-05 §16–§17 + age 14).
-- Append-only consent events + marketing legal kind + age gate + atomic record RPC.
-- DO NOT apply to Production without Owner approval.
BEGIN;

-- 1) Legal CMS kind: marketing (optional signup / settings doc)
ALTER TABLE public.app_legal_documents
  DROP CONSTRAINT IF EXISTS app_legal_documents_kind_check;
ALTER TABLE public.app_legal_documents
  ADD CONSTRAINT app_legal_documents_kind_check
  CHECK (kind IN ('terms', 'privacy', 'marketing'));

COMMENT ON CONSTRAINT app_legal_documents_kind_check ON public.app_legal_documents IS
  'terms+privacy=required consent; marketing=optional (signup/settings).';

-- 2) Marketing consent audit columns (current state remains marketing_enabled)
ALTER TABLE public.user_notification_settings
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS marketing_consent_source text NULL,
  ADD COLUMN IF NOT EXISTS marketing_consent_version text NULL;

COMMENT ON COLUMN public.user_notification_settings.marketing_consent_at IS
  'Last marketing agree/withdraw timestamp (member settings or signup).';
COMMENT ON COLUMN public.user_notification_settings.marketing_consent_source IS
  'signup | reconsent | settings | migration — never invent existing_member_default without Owner data job.';
COMMENT ON COLUMN public.user_notification_settings.marketing_consent_version IS
  'Published marketing legal doc version when agreed (nullable on withdraw).';

-- 3) Age gate columns on profiles (DOB never for public profile APIs)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date NULL,
  ADD COLUMN IF NOT EXISTS age_gate_status text NULL,
  ADD COLUMN IF NOT EXISTS age_attested_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_age_gate_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_age_gate_status_check
      CHECK (
        age_gate_status IS NULL
        OR age_gate_status IN ('unverified', 'verified', 'blocked_underage')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.profiles.date_of_birth IS
  'Self-declared DOB for age gate. Never expose on public profile surfaces.';
COMMENT ON COLUMN public.profiles.age_gate_status IS
  'unverified | verified | blocked_underage — required for member write gate with terms/privacy.';
COMMENT ON COLUMN public.profiles.age_attested_at IS
  'When member attested age (signup/reconsent).';

-- 4) Append-only consent event ledger
CREATE TABLE IF NOT EXISTS public.member_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('terms', 'privacy', 'marketing', 'age_attestation')),
  action text NOT NULL CHECK (action IN ('agree', 'withdraw', 'admin_note')),
  source text NOT NULL CHECK (source IN ('signup', 'reconsent', 'settings', 'migration', 'admin')),
  version text NULL,
  actor_admin_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_consent_events_user_created
  ON public.member_consent_events (user_id, created_at DESC);

COMMENT ON TABLE public.member_consent_events IS
  'Append-only consent ledger. No UPDATE/DELETE of member history. Admin may INSERT admin_note only.';

ALTER TABLE public.member_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_consent_events_select_own ON public.member_consent_events;
CREATE POLICY member_consent_events_select_own
  ON public.member_consent_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Members never INSERT via client RLS — service role / SECURITY DEFINER RPC only.
REVOKE ALL ON public.member_consent_events FROM PUBLIC;
GRANT SELECT ON public.member_consent_events TO authenticated;
GRANT ALL ON public.member_consent_events TO service_role;

-- 5) Atomic required consent recorder (profiles + events + optional marketing)
CREATE OR REPLACE FUNCTION public.record_member_required_consent(
  p_user_id uuid,
  p_terms_version text,
  p_privacy_version text,
  p_date_of_birth date,
  p_source text,
  p_agree_marketing boolean DEFAULT false,
  p_marketing_version text DEFAULT NULL,
  p_update_terms_privacy boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_age int;
  v_src text;
  v_was_marketing boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user' USING ERRCODE = '22023';
  END IF;
  v_src := CASE WHEN p_source IN ('signup', 'reconsent') THEN p_source ELSE 'signup' END;

  IF p_date_of_birth IS NULL THEN
    RAISE EXCEPTION 'dob_required' USING ERRCODE = '22023';
  END IF;
  IF p_date_of_birth > CURRENT_DATE OR p_date_of_birth < DATE '1900-01-01' THEN
    RAISE EXCEPTION 'dob_invalid' USING ERRCODE = '22023';
  END IF;

  v_age := date_part('year', age(CURRENT_DATE, p_date_of_birth))::int;
  IF v_age < 14 THEN
    UPDATE public.profiles
    SET
      date_of_birth = p_date_of_birth,
      age_gate_status = 'blocked_underage',
      age_attested_at = v_now,
      updated_at = v_now
    WHERE id = p_user_id;
    RAISE EXCEPTION 'age_under_minimum' USING ERRCODE = 'P0001';
  END IF;

  IF p_update_terms_privacy THEN
    IF coalesce(trim(p_terms_version), '') = '' OR coalesce(trim(p_privacy_version), '') = '' THEN
      RAISE EXCEPTION 'consent_versions_required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.profiles
    SET
      terms_accepted_at = v_now,
      terms_version = trim(p_terms_version),
      privacy_accepted_at = v_now,
      privacy_version = trim(p_privacy_version),
      date_of_birth = p_date_of_birth,
      age_gate_status = 'verified',
      age_attested_at = v_now,
      onboarding_status = 'oauth_authenticated',
      updated_at = v_now
    WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
    SET
      date_of_birth = p_date_of_birth,
      age_gate_status = 'verified',
      age_attested_at = v_now,
      updated_at = v_now
    WHERE id = p_user_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing' USING ERRCODE = 'P0002';
  END IF;

  IF p_update_terms_privacy THEN
    INSERT INTO public.member_consent_events (user_id, kind, action, source, version)
    VALUES
      (p_user_id, 'terms', 'agree', v_src, trim(p_terms_version)),
      (p_user_id, 'privacy', 'agree', v_src, trim(p_privacy_version));
  END IF;

  INSERT INTO public.member_consent_events (user_id, kind, action, source, version)
  VALUES (p_user_id, 'age_attestation', 'agree', v_src, 'min_age_14');

  SELECT marketing_enabled INTO v_was_marketing
  FROM public.user_notification_settings
  WHERE user_id = p_user_id;

  INSERT INTO public.user_notification_settings AS uns (
    user_id,
    marketing_enabled,
    updated_at,
    marketing_consent_at,
    marketing_consent_source,
    marketing_consent_version
  ) VALUES (
    p_user_id,
    coalesce(p_agree_marketing, false),
    v_now,
    CASE
      WHEN coalesce(p_agree_marketing, false) IS DISTINCT FROM coalesce(v_was_marketing, false)
        THEN v_now
      ELSE NULL
    END,
    CASE
      WHEN coalesce(p_agree_marketing, false) IS DISTINCT FROM coalesce(v_was_marketing, false)
        THEN v_src
      ELSE NULL
    END,
    CASE WHEN coalesce(p_agree_marketing, false) THEN nullif(trim(p_marketing_version), '') ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    marketing_enabled = EXCLUDED.marketing_enabled,
    updated_at = EXCLUDED.updated_at,
    marketing_consent_at = COALESCE(
      EXCLUDED.marketing_consent_at,
      uns.marketing_consent_at
    ),
    marketing_consent_source = COALESCE(
      EXCLUDED.marketing_consent_source,
      uns.marketing_consent_source
    ),
    marketing_consent_version = CASE
      WHEN EXCLUDED.marketing_enabled THEN EXCLUDED.marketing_consent_version
      WHEN coalesce(p_agree_marketing, false) IS DISTINCT FROM coalesce(v_was_marketing, false)
        THEN NULL
      ELSE uns.marketing_consent_version
    END;

  IF coalesce(p_agree_marketing, false) AND coalesce(v_was_marketing, false) IS NOT TRUE THEN
    INSERT INTO public.member_consent_events (user_id, kind, action, source, version)
    VALUES (p_user_id, 'marketing', 'agree', v_src, nullif(trim(p_marketing_version), ''));
  ELSIF (NOT coalesce(p_agree_marketing, false)) AND coalesce(v_was_marketing, false) IS TRUE THEN
    INSERT INTO public.member_consent_events (user_id, kind, action, source, version)
    VALUES (p_user_id, 'marketing', 'withdraw', v_src, NULL);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'termsVersion', CASE WHEN p_update_terms_privacy THEN trim(p_terms_version) ELSE NULL END,
    'privacyVersion', CASE WHEN p_update_terms_privacy THEN trim(p_privacy_version) ELSE NULL END,
    'dateOfBirth', p_date_of_birth,
    'ageYears', v_age,
    'marketingEnabled', coalesce(p_agree_marketing, false),
    'recordedAt', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_required_consent(
  uuid, text, text, date, text, boolean, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_member_required_consent(
  uuid, text, text, date, text, boolean, text, boolean
) TO service_role;

COMMENT ON FUNCTION public.record_member_required_consent IS
  'Atomic required consent: profiles + member_consent_events (+ optional marketing). Fail = full rollback.';

-- 6) Write-gate snapshot includes age fields (B3 consentComplete = terms+privacy+age)
CREATE OR REPLACE FUNCTION public.member_write_gate_snapshot(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p.id IS NULL THEN jsonb_build_object('found', false)
    ELSE jsonb_build_object(
      'found', true,
      'status', p.status,
      'deleted_at', p.deleted_at,
      'terms_accepted_at', p.terms_accepted_at,
      'terms_version', p.terms_version,
      'privacy_accepted_at', p.privacy_accepted_at,
      'privacy_version', p.privacy_version,
      'date_of_birth', p.date_of_birth,
      'age_gate_status', p.age_gate_status,
      'age_attested_at', p.age_attested_at,
      'role', p.role,
      'admin_role', (
        SELECT m.role FROM public.admin_memberships m
         WHERE m.user_id = p_user_id AND m.status = 'active'
         LIMIT 1
      )
    )
  END
  FROM (SELECT 1) AS one
  LEFT JOIN public.profiles p ON p.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.member_write_gate_snapshot(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_write_gate_snapshot(uuid) TO service_role;

COMMIT;
