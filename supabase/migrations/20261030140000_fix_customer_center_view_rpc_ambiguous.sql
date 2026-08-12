-- Fix ambiguous view_count in record_customer_center_content_view (RETURNS TABLE vs column).
-- Non-destructive CREATE OR REPLACE only. Does not reapply prior Customer Center migrations.

CREATE OR REPLACE FUNCTION public.record_customer_center_content_view(
  p_content_id uuid,
  p_user_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (view_count integer, recorded boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_day date;
  v_rowcount integer := 0;
  v_count integer;
BEGIN
  IF p_content_id IS NULL OR p_user_id IS NULL THEN
    RETURN QUERY SELECT 0, false;
    RETURN;
  END IF;

  v_day := (p_now AT TIME ZONE 'Asia/Seoul')::date;

  INSERT INTO public.customer_center_content_views (content_id, user_id, view_day)
  VALUES (p_content_id, p_user_id, v_day)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_rowcount = ROW_COUNT;

  IF v_rowcount > 0 THEN
    UPDATE public.app_notices AS an
    SET view_count = an.view_count + 1,
        updated_at = p_now
    WHERE an.id = p_content_id
      AND an.deleted_at IS NULL;
  END IF;

  SELECT COALESCE(an.view_count, 0)
  INTO v_count
  FROM public.app_notices AS an
  WHERE an.id = p_content_id;

  RETURN QUERY SELECT COALESCE(v_count, 0), (v_rowcount > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamptz) IS
  'Increment app_notices.view_count at most once per member/content/Seoul-day. Not notification read.';
