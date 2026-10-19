-- Phone OTP admin ops: CAS version + change metadata + delivery event log.
-- Do NOT auto-run on Production without Owner cutover approval.

ALTER TABLE public.auth_phone_settings
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS change_reason text,
  ADD COLUMN IF NOT EXISTS row_version int NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.phone_otp_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'failed')),
  provider_code text,
  provider_message_id text,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_otp_delivery_events_created_at_idx
  ON public.phone_otp_delivery_events (created_at DESC);

ALTER TABLE public.phone_otp_delivery_events ENABLE ROW LEVEL SECURITY;

-- Service-role only (no anon/authenticated policies).

CREATE OR REPLACE FUNCTION public.admin_set_auth_phone_otp_enabled(
  p_enabled boolean,
  p_reason text,
  p_actor_id uuid,
  p_expected_version int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_version int;
  v_invalidated int := 0;
  v_next int;
BEGIN
  SELECT id, COALESCE(row_version, 1)
    INTO v_id, v_version
  FROM public.auth_phone_settings
  WHERE country_code = 'PH'
  ORDER BY updated_at DESC NULLS LAST
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'settings_missing');
  END IF;

  IF v_version <> p_expected_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'version_conflict',
      'current_version', v_version
    );
  END IF;

  v_next := v_version + 1;

  UPDATE public.auth_phone_settings
  SET
    enabled = p_enabled,
    change_reason = NULLIF(trim(p_reason), ''),
    updated_by = p_actor_id,
    row_version = v_next,
    updated_at = now()
  WHERE id = v_id;

  IF NOT p_enabled THEN
    UPDATE public.phone_otp_challenges
    SET
      otp_expires_at = LEAST(otp_expires_at, now() - interval '1 second'),
      updated_at = now()
    WHERE verified_at IS NULL;
    GET DIAGNOSTICS v_invalidated = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', p_enabled,
    'row_version', v_next,
    'invalidated_challenges', v_invalidated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_auth_phone_otp_enabled(boolean, text, uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_auth_phone_otp_enabled(boolean, text, uuid, int) TO service_role;
