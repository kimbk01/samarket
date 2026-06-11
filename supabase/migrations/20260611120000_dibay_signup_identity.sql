-- DIBAY signup identity: dibay_id, onboarding lifecycle, confirm RPC.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dibay_id text,
  ADD COLUMN IF NOT EXISTS dibay_id_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_onboarding_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_onboarding_status_check
  CHECK (
    onboarding_status IN (
      'pending',
      'oauth_authenticated',
      'terms_required',
      'id_required',
      'profile_ready',
      'completed'
    )
  );

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_dibay_id_format_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_dibay_id_format_check
  CHECK (
    dibay_id IS NULL
    OR btrim(dibay_id) = ''
    OR (
      dibay_id ~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$'
      AND lower(dibay_id) NOT IN (
        'admin',
        'administrator',
        'support',
        'owner',
        'system',
        'official',
        'staff',
        'root',
        'mod',
        'help',
        'dibay',
        'samarket'
      )
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS profiles_dibay_id_lower_unique_idx
  ON public.profiles (lower(dibay_id))
  WHERE dibay_id IS NOT NULL AND btrim(dibay_id) <> '';

-- Backfill: user-confirmed non-auto usernames → dibay_id
UPDATE public.profiles
SET
  dibay_id = lower(btrim(username)),
  dibay_id_locked = true,
  onboarding_status = 'completed',
  onboarding_completed_at = COALESCE(onboarding_completed_at, username_set_at, updated_at, now())
WHERE username_confirmed = true
  AND username IS NOT NULL
  AND btrim(username) <> ''
  AND username ~ '^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$'
  AND lower(username) NOT IN (
    'admin', 'administrator', 'support', 'owner', 'system', 'official',
    'staff', 'root', 'mod', 'help', 'dibay', 'samarket'
  )
  AND lower(username) !~ '^dibay_[a-f0-9]{6}$'
  AND (dibay_id IS NULL OR btrim(dibay_id) = '');

-- Reset auto-generated dibay_* placeholders — force @id re-entry
UPDATE public.profiles
SET
  username_confirmed = false,
  dibay_id = NULL,
  dibay_id_locked = false,
  onboarding_status = CASE
    WHEN terms_accepted_at IS NOT NULL
      AND privacy_accepted_at IS NOT NULL
      AND terms_version IS NOT NULL
      AND privacy_version IS NOT NULL
    THEN 'id_required'
    ELSE 'terms_required'
  END,
  onboarding_completed_at = NULL
WHERE dibay_id_locked = false
  AND onboarding_completed_at IS NULL
  AND username IS NOT NULL
  AND lower(btrim(username)) ~ '^dibay_[a-f0-9]{6}$';

-- Completed members with onboarding_completed_at already set
UPDATE public.profiles
SET onboarding_status = 'completed'
WHERE onboarding_completed_at IS NOT NULL
  AND onboarding_status <> 'completed';

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

  IF v_row.dibay_id_locked = true AND v_row.dibay_id IS NOT NULL AND btrim(v_row.dibay_id) <> '' THEN
    IF lower(btrim(v_row.dibay_id)) = v_normalized THEN
      RETURN jsonb_build_object('ok', true, 'dibay_id', lower(btrim(v_row.dibay_id)), 'idempotent', true);
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

REVOKE ALL ON FUNCTION public.confirm_dibay_id(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_dibay_id(uuid, text) TO service_role;

COMMIT;
