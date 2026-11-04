-- Member consent: existing-member exemption + ledger immutability + RPC hardening (Owner 2026-11-05).
-- Requires 20271105120100 (applied) and 20271105130000 (EXECUTE revoke).
-- DO NOT apply to Production without Owner approval. Apply BEFORE the web code that reads age_gate_legacy.
--
-- 1) Existing members (pre-policy) = fixed set of profile ids frozen once, by id. Not "DOB IS NULL".
--    They are exempt from the age gate only; terms/privacy re-consent rules stay as before.
--    No consent events are created for them.
-- 2) member_consent_events: UPDATE / TRUNCATE blocked (DELETE kept for auth.users ON DELETE CASCADE).
-- 3) record_member_required_consent: row lock + idempotent re-submit, no marketing writes
--    (marketing SSOT = lib/legal/marketing-consent.server), existing members never store DOB,
--    under-14 is refused without writing anything (retry limit / DOB correction: separate Owner decision).
BEGIN;

-- 1) Existing-member set ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.member_age_gate_legacy_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  frozen_at timestamptz NOT NULL DEFAULT now(),
  basis text NOT NULL DEFAULT 'pre_age_policy_member_2026_11_05'
);
COMMENT ON TABLE public.member_age_gate_legacy_members IS
  'Members that existed before the age policy (frozen once by id). Age gate exempt; not a consent record.';

ALTER TABLE public.member_age_gate_legacy_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_age_gate_legacy_members FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.member_age_gate_legacy_members TO service_role;

DO $$
DECLARE
  v_expected int := 130;  -- Owner-confirmed count (read-only audit 2026-11-05 03:5x PHT)
  v_count int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.member_age_gate_legacy_members) THEN
    RAISE EXCEPTION 'legacy_set_already_frozen';
  END IF;
  SELECT count(*) INTO v_count FROM public.profiles;
  IF v_count <> v_expected THEN
    RAISE EXCEPTION 'legacy_set_count_mismatch: profiles=% expected=%', v_count, v_expected;
  END IF;
  INSERT INTO public.member_age_gate_legacy_members (user_id)
  SELECT p.id FROM public.profiles p;
END $$;

-- 2) Ledger immutability ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.member_consent_events_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'member_consent_events_append_only' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.member_consent_events_block_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_consent_events_no_update ON public.member_consent_events;
CREATE TRIGGER member_consent_events_no_update
  BEFORE UPDATE ON public.member_consent_events
  FOR EACH ROW EXECUTE FUNCTION public.member_consent_events_block_mutation();

DROP TRIGGER IF EXISTS member_consent_events_no_truncate ON public.member_consent_events;
CREATE TRIGGER member_consent_events_no_truncate
  BEFORE TRUNCATE ON public.member_consent_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.member_consent_events_block_mutation();

-- 3) Atomic required consent (same signature — no new overload) ----------------------------------
CREATE OR REPLACE FUNCTION public.record_member_required_consent(
  p_user_id uuid,
  p_terms_version text,
  p_privacy_version text,
  p_date_of_birth date,
  p_source text,
  p_agree_marketing boolean DEFAULT false,   -- ignored: marketing SSOT is marketing-consent.server
  p_marketing_version text DEFAULT NULL,     -- ignored
  p_update_terms_privacy boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_src text;
  v_legacy boolean;
  v_prof record;
  v_terms_ok boolean;
  v_age_ok boolean;
  v_age int;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_user' USING ERRCODE = '22023';
  END IF;
  v_src := CASE WHEN p_source IN ('signup', 'reconsent') THEN p_source ELSE 'signup' END;

  SELECT terms_accepted_at, terms_version, privacy_accepted_at, privacy_version,
         age_gate_status, age_attested_at
    INTO v_prof
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing' USING ERRCODE = 'P0002';
  END IF;

  v_legacy := EXISTS (SELECT 1 FROM public.member_age_gate_legacy_members WHERE user_id = p_user_id);

  IF p_update_terms_privacy
     AND (coalesce(trim(p_terms_version), '') = '' OR coalesce(trim(p_privacy_version), '') = '') THEN
    RAISE EXCEPTION 'consent_versions_required' USING ERRCODE = '22023';
  END IF;

  v_terms_ok := v_prof.terms_accepted_at IS NOT NULL
    AND v_prof.privacy_accepted_at IS NOT NULL
    AND v_prof.terms_version = trim(p_terms_version)
    AND v_prof.privacy_version = trim(p_privacy_version);
  v_age_ok := v_legacy OR (v_prof.age_gate_status = 'verified' AND v_prof.age_attested_at IS NOT NULL);

  -- Idempotent re-submit (double tap / retry): nothing new to record.
  IF (NOT p_update_terms_privacy OR v_terms_ok) AND v_age_ok THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'legacy', v_legacy, 'recordedAt', v_now);
  END IF;

  IF NOT v_age_ok THEN
    IF p_date_of_birth IS NULL THEN
      RAISE EXCEPTION 'dob_required' USING ERRCODE = '22023';
    END IF;
    IF p_date_of_birth > CURRENT_DATE OR p_date_of_birth < DATE '1900-01-01' THEN
      RAISE EXCEPTION 'dob_invalid' USING ERRCODE = '22023';
    END IF;
    v_age := date_part('year', age(CURRENT_DATE, p_date_of_birth))::int;
    IF v_age < 14 THEN
      -- Refused with no write: no DOB, no status, no event.
      RETURN jsonb_build_object('ok', false, 'code', 'age_under_minimum');
    END IF;
  END IF;

  IF p_update_terms_privacy AND NOT v_terms_ok THEN
    UPDATE public.profiles
       SET terms_accepted_at = v_now,
           terms_version = trim(p_terms_version),
           privacy_accepted_at = v_now,
           privacy_version = trim(p_privacy_version),
           onboarding_status = 'oauth_authenticated',
           updated_at = v_now
     WHERE id = p_user_id;
    INSERT INTO public.member_consent_events (user_id, kind, action, source, version)
    VALUES
      (p_user_id, 'terms', 'agree', v_src, trim(p_terms_version)),
      (p_user_id, 'privacy', 'agree', v_src, trim(p_privacy_version));
  END IF;

  IF NOT v_age_ok THEN
    UPDATE public.profiles
       SET date_of_birth = p_date_of_birth,
           age_gate_status = 'verified',
           age_attested_at = v_now,
           updated_at = v_now
     WHERE id = p_user_id;
    INSERT INTO public.member_consent_events (user_id, kind, action, source, version)
    VALUES (p_user_id, 'age_attestation', 'agree', v_src, 'min_age_14');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'legacy', v_legacy,
    'termsVersion', CASE WHEN p_update_terms_privacy THEN trim(p_terms_version) ELSE NULL END,
    'privacyVersion', CASE WHEN p_update_terms_privacy THEN trim(p_privacy_version) ELSE NULL END,
    'ageYears', v_age,
    'recordedAt', v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_member_required_consent(
  uuid, text, text, date, text, boolean, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_member_required_consent(
  uuid, text, text, date, text, boolean, text, boolean
) TO service_role;

-- 4) Write-gate snapshot: + age_gate_legacy (B3 single read) -------------------------------------
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
      'age_gate_legacy', EXISTS (
        SELECT 1 FROM public.member_age_gate_legacy_members l WHERE l.user_id = p_user_id
      ),
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
