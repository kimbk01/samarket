-- B11 (DIBAY FIRST ENTRY): confirm_dibay_id must judge consent against the same required versions
-- as the app (lib/legal/resolve-required-consent-versions.ts — published ko legal CMS, effective now,
-- STORE_* fallback '2026-04-store-review' only when no published row exists).
-- Before: v_terms_version / v_privacy_version were the literal '2026-04-store-review', so after an
-- Admin publish of a new version, members who re-consented got terms_required here.
-- Body identical to the live definition except the two version sources. Grants unchanged
-- (CREATE OR REPLACE keeps ACL).

CREATE OR REPLACE FUNCTION public.confirm_dibay_id(p_user_id uuid, p_dibay_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_normalized text;
  v_row public.profiles%ROWTYPE;
  v_terms_version text;
  v_privacy_version text;
  v_now timestamptz := now();
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

  -- Same pick rule as pickCurrentPublishedLegalDoc (lib/legal/app-legal-documents.ts).
  SELECT d.version INTO v_terms_version
  FROM public.app_legal_documents d
  WHERE d.kind = 'terms' AND d.locale = 'ko' AND d.status = 'published'
    AND (d.effective_at IS NULL OR d.effective_at <= v_now)
  ORDER BY d.effective_at DESC NULLS LAST, d.published_at DESC NULLS LAST
  LIMIT 1;
  SELECT d.version INTO v_privacy_version
  FROM public.app_legal_documents d
  WHERE d.kind = 'privacy' AND d.locale = 'ko' AND d.status = 'published'
    AND (d.effective_at IS NULL OR d.effective_at <= v_now)
  ORDER BY d.effective_at DESC NULLS LAST, d.published_at DESC NULLS LAST
  LIMIT 1;
  v_terms_version := COALESCE(NULLIF(btrim(v_terms_version), ''), '2026-04-store-review');
  v_privacy_version := COALESCE(NULLIF(btrim(v_privacy_version), ''), '2026-04-store-review');

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;

  v_normalized := lower(btrim(replace(COALESCE(p_dibay_id, ''), '@', '')));
  IF v_normalized = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_required');
  END IF;

  IF v_normalized !~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_invalid_format');
  END IF;

  IF v_normalized IN (
    'admin', 'administrator', 'support', 'owner', 'system', 'official',
    'staff', 'root', 'mod', 'help', 'dibay', 'samarket'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved');
  END IF;

  IF v_normalized ~ '^dibay_[a-f0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_reserved_pattern');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  IF COALESCE(v_row.dibay_id_changed_once, false) = true
     AND v_row.dibay_id_locked = true
     AND v_row.dibay_id IS NOT NULL
     AND btrim(v_row.dibay_id) <> '' THEN
    IF lower(btrim(v_row.dibay_id)) = v_normalized THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dibay_id', lower(btrim(v_row.dibay_id)),
        'idempotent', true
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_change_limit');
  END IF;

  IF COALESCE(v_row.dibay_id_auto_assigned, false) = true
     AND COALESCE(v_row.dibay_id_changed_once, false) = false
     AND v_row.dibay_id IS NOT NULL
     AND btrim(v_row.dibay_id) <> '' THEN
    IF v_row.terms_accepted_at IS NULL
      OR v_row.privacy_accepted_at IS NULL
      OR v_row.terms_version IS DISTINCT FROM v_terms_version
      OR v_row.privacy_version IS DISTINCT FROM v_privacy_version
    THEN
      RETURN jsonb_build_object('ok', false, 'error', 'terms_required');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE lower(btrim(p.dibay_id)) = v_normalized
        AND p.id <> p_user_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE lower(btrim(p.username)) = v_normalized
        AND p.id <> p_user_id
        AND p.username_confirmed = true
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
    END IF;

    UPDATE public.profiles
    SET
      dibay_id = v_normalized,
      dibay_id_auto_assigned = false,
      dibay_id_changed_once = true,
      dibay_id_changed_at = v_now,
      dibay_id_locked = true,
      username = v_normalized,
      username_confirmed = true,
      username_set_at = COALESCE(username_set_at, v_now),
      onboarding_status = 'completed',
      onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
      updated_at = v_now
    WHERE id = p_user_id;

    RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized);
  END IF;

  IF v_row.dibay_id_locked = true
     AND v_row.dibay_id IS NOT NULL
     AND btrim(v_row.dibay_id) <> '' THEN
    IF lower(btrim(v_row.dibay_id)) = v_normalized THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dibay_id', lower(btrim(v_row.dibay_id)),
        'idempotent', true
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_already_locked');
  END IF;

  IF v_row.terms_accepted_at IS NULL
    OR v_row.privacy_accepted_at IS NULL
    OR v_row.terms_version IS DISTINCT FROM v_terms_version
    OR v_row.privacy_version IS DISTINCT FROM v_privacy_version
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'terms_required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(btrim(p.dibay_id)) = v_normalized
      AND p.id <> p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE lower(btrim(p.username)) = v_normalized
      AND p.id <> p_user_id
      AND p.username_confirmed = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
  END IF;

  UPDATE public.profiles
  SET
    dibay_id = v_normalized,
    dibay_id_auto_assigned = false,
    dibay_id_changed_once = true,
    dibay_id_changed_at = v_now,
    dibay_id_locked = true,
    username = v_normalized,
    username_confirmed = true,
    username_set_at = COALESCE(username_set_at, v_now),
    onboarding_status = 'completed',
    onboarding_completed_at = COALESCE(onboarding_completed_at, v_now),
    updated_at = v_now
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_normalized);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
END;
$function$;
