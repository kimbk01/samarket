-- Customer Center Content: view dedupe + comments (separate from Community).
-- Badge/Bell/FCM NOT touched. Soft delete only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_center_content_views (
  content_id uuid NOT NULL REFERENCES public.app_notices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_id, user_id, view_day)
);

CREATE INDEX IF NOT EXISTS idx_cc_content_views_user_day
  ON public.customer_center_content_views (user_id, view_day DESC);

COMMENT ON TABLE public.customer_center_content_views IS
  'Customer Center board view dedupe: 1 view / member / content / day. Not Bell read-state.';

CREATE TABLE IF NOT EXISTS public.customer_center_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id uuid NOT NULL REFERENCES public.app_notices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_center_comments_body_len CHECK (char_length(body) >= 1 AND char_length(body) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_cc_comments_content_created
  ON public.customer_center_comments (content_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_cc_comments_user_created
  ON public.customer_center_comments (user_id, created_at DESC);

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS comment_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_notices_comment_count_nonneg'
      AND conrelid = 'public.app_notices'::regclass
  ) THEN
    ALTER TABLE public.app_notices
      ADD CONSTRAINT app_notices_comment_count_nonneg
      CHECK (comment_count >= 0);
  END IF;
END $$;

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
    UPDATE public.app_notices
    SET view_count = view_count + 1,
        updated_at = p_now
    WHERE id = p_content_id
      AND deleted_at IS NULL;
  END IF;

  SELECT COALESCE(a.view_count, 0)
  INTO v_count
  FROM public.app_notices a
  WHERE a.id = p_content_id;

  RETURN QUERY SELECT COALESCE(v_count, 0), (v_rowcount > 0);
END;
$$;

REVOKE ALL ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamptz) TO service_role;

COMMENT ON FUNCTION public.record_customer_center_content_view(uuid, uuid, timestamptz) IS
  'Increment app_notices.view_count at most once per member/content/Seoul-day. Not notification read.';

ALTER TABLE public.customer_center_content_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_center_comments ENABLE ROW LEVEL SECURITY;

-- Member APIs use service role; no broad authenticated policies that invent badge paths.
DROP POLICY IF EXISTS cc_content_views_deny_all ON public.customer_center_content_views;
CREATE POLICY cc_content_views_deny_all ON public.customer_center_content_views
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS cc_comments_deny_all ON public.customer_center_comments;
CREATE POLICY cc_comments_deny_all ON public.customer_center_comments
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

COMMIT;
