-- DIBAY @id auto-assign on signup + one-time custom change audit fields.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dibay_id_auto_assigned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dibay_id_initial text,
  ADD COLUMN IF NOT EXISTS dibay_id_changed_once boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dibay_id_changed_at timestamptz;

COMMENT ON COLUMN public.profiles.dibay_id_auto_assigned IS
  'Server-assigned dibay_[hex6] at signup/backfill. User may change once to custom @id.';
COMMENT ON COLUMN public.profiles.dibay_id_initial IS
  'First auto-assigned dibay_id preserved for admin audit.';
COMMENT ON COLUMN public.profiles.dibay_id_changed_once IS
  'True after user exercised the one-time custom @id change.';
COMMENT ON COLUMN public.profiles.dibay_id_changed_at IS
  'Timestamp of one-time custom @id change.';

-- ---------------------------------------------------------------------------
-- assign_auto_dibay_id — service_role API / profile ensure only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_auto_dibay_id(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_candidate text;
  v_now timestamptz := now();
  v_attempt int := 0;
  v_max_attempts int := 32;
BEGIN
  -- Supabase migration/backfill runs as postgres superuser — bypass JWT gate.
  IF session_user NOT IN ('postgres', 'supabase_admin') THEN
    IF (SELECT auth.role()) <> 'service_role' THEN
      IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
        RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
      END IF;
    END IF;
  END IF;

  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_id_required');
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_missing');
  END IF;

  IF v_row.dibay_id IS NOT NULL AND btrim(v_row.dibay_id) <> '' THEN
    IF COALESCE(v_row.dibay_id_auto_assigned, false) = true
       AND COALESCE(v_row.dibay_id_changed_once, false) = false THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dibay_id', lower(btrim(v_row.dibay_id)),
        'idempotent', true
      );
    END IF;
    IF v_row.dibay_id_locked = true
       OR COALESCE(v_row.dibay_id_changed_once, false) = true
       OR (
         v_row.username_confirmed = true
         AND lower(btrim(v_row.dibay_id)) !~ '^dibay_[a-f0-9]{6}$'
       ) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'dibay_id', lower(btrim(v_row.dibay_id)),
        'idempotent', true,
        'skipped', true
      );
    END IF;
  END IF;

  IF (v_row.dibay_id IS NULL OR btrim(v_row.dibay_id) = '')
     AND v_row.username_confirmed = true
     AND v_row.username IS NOT NULL
     AND btrim(v_row.username) <> ''
     AND lower(btrim(v_row.username)) !~ '^dibay_[a-f0-9]{6}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'skip_user_confirmed');
  END IF;

  IF v_row.dibay_id_locked = true
     AND COALESCE(v_row.dibay_id_auto_assigned, false) = false
     AND v_row.dibay_id IS NOT NULL
     AND btrim(v_row.dibay_id) <> '' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dibay_id', lower(btrim(v_row.dibay_id)),
      'idempotent', true,
      'skipped', true
    );
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    IF v_attempt > v_max_attempts THEN
      RETURN jsonb_build_object('ok', false, 'error', 'assign_collision_exhausted');
    END IF;

    -- gen_random_uuid() — core PG, pgcrypto/search_path 불필요 (Supabase SQL Editor 호환)
    v_candidate := 'dibay_' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE lower(btrim(p.dibay_id)) = v_candidate
         OR (
           lower(btrim(p.username)) = v_candidate
           AND p.username_confirmed = true
         )
    );
  END LOOP;

  UPDATE public.profiles
  SET
    dibay_id = v_candidate,
    username = v_candidate,
    username_confirmed = true,
    dibay_id_auto_assigned = true,
    dibay_id_initial = v_candidate,
    dibay_id_changed_once = false,
    dibay_id_changed_at = NULL,
    dibay_id_locked = false,
    username_set_at = COALESCE(username_set_at, v_now),
    updated_at = v_now
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'dibay_id', v_candidate);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dibay_id_taken');
END;
$$;

COMMENT ON FUNCTION public.assign_auto_dibay_id(uuid) IS
  'Assign dibay_[hex6] for signup/backfill — service_role API only.';

REVOKE ALL ON FUNCTION public.assign_auto_dibay_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_auto_dibay_id(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- confirm_dibay_id — auto-assigned one-time change + legacy first confirm
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_dibay_id(
  p_user_id uuid,
  p_dibay_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized text;
  v_row public.profiles%ROWTYPE;
  v_terms_version text := '2026-04-store-review';
  v_privacy_version text := '2026-04-store-review';
  v_now timestamptz := now();
BEGIN
  IF (SELECT auth.role()) <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
    END IF;
  END IF;

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
$$;

COMMENT ON FUNCTION public.confirm_dibay_id(uuid, text) IS
  'DIBAY @id confirm or one-time change from auto-assigned — service_role API only.';

REVOKE ALL ON FUNCTION public.confirm_dibay_id(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_dibay_id(uuid, text) TO service_role;

-- Backfill: existing members without dibay_id (never touch user-confirmed custom username)
DO $$
DECLARE
  r record;
  v_result jsonb;
BEGIN
  FOR r IN
    SELECT p.id
    FROM public.profiles p
    WHERE (p.dibay_id IS NULL OR btrim(p.dibay_id) = '')
      AND COALESCE(p.dibay_id_locked, false) = false
      AND NOT (
        p.username_confirmed = true
        AND p.username IS NOT NULL
        AND btrim(p.username) <> ''
        AND lower(btrim(p.username)) !~ '^dibay_[a-f0-9]{6}$'
      )
  LOOP
    v_result := public.assign_auto_dibay_id(r.id);
  END LOOP;
END $$;

COMMIT;
