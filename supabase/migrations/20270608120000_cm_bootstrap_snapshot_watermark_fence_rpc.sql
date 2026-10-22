-- CM bootstrap snapshot: serverless-safe watermark invalidate + fenced upsert.
-- Uses transaction-scoped advisory lock so concurrent Vercel instances cannot
-- restore a pre-invalidation concrete row or lose a watermark update.
-- Apply to ops DB only after Owner approval (not auto-applied by this change).

CREATE OR REPLACE FUNCTION public.invalidate_cm_bootstrap_snapshot_watermark(
  p_user_id uuid
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_at timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalidate_cm_bootstrap_snapshot_watermark: p_user_id required';
  END IF;

  -- Namespace 872014001 = CM bootstrap snapshot watermark (stable, app-specific).
  PERFORM pg_advisory_xact_lock(872014001, hashtext(p_user_id::text));

  INSERT INTO public.community_messenger_bootstrap_snapshots (
    user_id,
    bootstrap_scope,
    list_limit,
    cursor_key,
    payload_json,
    updated_at
  ) VALUES (
    p_user_id,
    '__invalidate__',
    0,
    '',
    jsonb_build_object('ok', false, 'error', 'invalidated'),
    clock_timestamp()
  )
  ON CONFLICT (user_id, bootstrap_scope, list_limit, cursor_key)
  DO UPDATE SET
    payload_json = EXCLUDED.payload_json,
    updated_at = clock_timestamp()
  RETURNING updated_at INTO v_at;

  RETURN v_at;
END;
$$;

COMMENT ON FUNCTION public.invalidate_cm_bootstrap_snapshot_watermark(uuid) IS
  'Atomically bump CM bootstrap invalidation watermark (DB clock). service_role only.';

CREATE OR REPLACE FUNCTION public.upsert_cm_bootstrap_snapshot_if_watermark_fence(
  p_user_id uuid,
  p_bootstrap_scope text,
  p_list_limit integer,
  p_cursor_key text,
  p_payload jsonb,
  p_fence timestamptz DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wm timestamptz;
  v_cursor text := coalesce(p_cursor_key, '');
BEGIN
  IF p_user_id IS NULL
     OR p_bootstrap_scope IS NULL
     OR length(trim(p_bootstrap_scope)) = 0
     OR p_bootstrap_scope = '__invalidate__'
     OR p_payload IS NULL THEN
    RETURN 'write_error';
  END IF;

  PERFORM pg_advisory_xact_lock(872014001, hashtext(p_user_id::text));

  SELECT s.updated_at
    INTO v_wm
  FROM public.community_messenger_bootstrap_snapshots s
  WHERE s.user_id = p_user_id
    AND s.bootstrap_scope = '__invalidate__'
    AND s.list_limit = 0
    AND s.cursor_key = '';

  IF NOT FOUND THEN
    v_wm := NULL;
  END IF;

  -- IS DISTINCT FROM: null fence matches absent watermark only.
  IF v_wm IS DISTINCT FROM p_fence THEN
    RETURN 'skipped_stale_race';
  END IF;

  INSERT INTO public.community_messenger_bootstrap_snapshots (
    user_id,
    bootstrap_scope,
    list_limit,
    cursor_key,
    payload_json,
    updated_at
  ) VALUES (
    p_user_id,
    p_bootstrap_scope,
    coalesce(p_list_limit, 0),
    v_cursor,
    p_payload,
    clock_timestamp()
  )
  ON CONFLICT (user_id, bootstrap_scope, list_limit, cursor_key)
  DO UPDATE SET
    payload_json = EXCLUDED.payload_json,
    updated_at = clock_timestamp();

  RETURN 'written';
END;
$$;

COMMENT ON FUNCTION public.upsert_cm_bootstrap_snapshot_if_watermark_fence(uuid, text, integer, text, jsonb, timestamptz) IS
  'Write concrete CM bootstrap snapshot only if watermark equals p_fence (advisory-locked). service_role only.';

REVOKE ALL ON FUNCTION public.invalidate_cm_bootstrap_snapshot_watermark(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_cm_bootstrap_snapshot_if_watermark_fence(uuid, text, integer, text, jsonb, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.invalidate_cm_bootstrap_snapshot_watermark(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_cm_bootstrap_snapshot_if_watermark_fence(uuid, text, integer, text, jsonb, timestamptz) TO service_role;
