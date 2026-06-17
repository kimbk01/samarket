-- 커뮤니티 게시글 engagement: 조회 dedup·저장(북마크)·숨김 + 신고 중복 방지

-- 1) 조회 기록 (24h dedup)
CREATE TABLE IF NOT EXISTS public.community_post_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  viewer_user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE,
  viewer_key text,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_views_actor_check CHECK (
    viewer_user_id IS NOT NULL OR (viewer_key IS NOT NULL AND length(trim(viewer_key)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_community_post_views_post_viewed
  ON public.community_post_views (post_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_community_post_views_user_post_viewed
  ON public.community_post_views (viewer_user_id, post_id, viewed_at DESC)
  WHERE viewer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_community_post_views_key_post_viewed
  ON public.community_post_views (viewer_key, post_id, viewed_at DESC)
  WHERE viewer_key IS NOT NULL;

-- 2) 저장(북마크) — 공감(likes)과 분리
CREATE TABLE IF NOT EXISTS public.community_post_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_saves_post_user_key UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_post_saves_user_created
  ON public.community_post_saves (user_id, created_at DESC);

-- 3) 피드 숨김 (작성자 차단과 별개)
CREATE TABLE IF NOT EXISTS public.community_post_hides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_hides_post_user_key UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_post_hides_user_created
  ON public.community_post_hides (user_id, created_at DESC);

-- 4) 신고 중복 방지 (post + reporter) — legacy DB / philife view 별칭 대응
DO $$
DECLARE
  v_reports regclass;
  v_has_post_id boolean;
BEGIN
  SELECT c.oid::regclass
  INTO v_reports
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN ('community_reports', 'philife_reports')
    AND c.relkind = 'r'
  ORDER BY CASE c.relname WHEN 'community_reports' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_reports IS NULL THEN
    RAISE WARNING 'community post engagement: no physical community_reports table — skip report dedup index';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = v_reports
      AND a.attname = 'target_type'
      AND NOT a.attisdropped
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD COLUMN target_type text NOT NULL DEFAULT ''post''', v_reports);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = v_reports
      AND a.attname = 'target_id'
      AND NOT a.attisdropped
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD COLUMN target_id text', v_reports);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = v_reports
      AND a.attname = 'reporter_id'
      AND NOT a.attisdropped
  ) THEN
    RAISE NOTICE 'community_reports base table % lacks reporter_id — skip unique index', v_reports;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = v_reports
      AND a.attname = 'post_id'
      AND NOT a.attisdropped
  )
  INTO v_has_post_id;

  IF v_has_post_id THEN
    EXECUTE format(
      'UPDATE %s SET target_id = post_id::text WHERE target_id IS NULL AND post_id IS NOT NULL',
      v_reports
    );
  END IF;

  EXECUTE format(
    'UPDATE %s SET target_type = ''post'' WHERE target_type IS NULL',
    v_reports
  );

  EXECUTE format(
    $sql$
      DELETE FROM %s r
      USING (
        SELECT id,
          row_number() OVER (
            PARTITION BY target_id, reporter_id
            ORDER BY created_at DESC NULLS LAST, id DESC
          ) AS rn
        FROM %s
        WHERE target_type = 'post'
          AND target_id IS NOT NULL
          AND reporter_id IS NOT NULL
      ) d
      WHERE r.id = d.id AND d.rn > 1
    $sql$,
    v_reports,
    v_reports
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'community_reports_post_reporter_unique'
  ) THEN
    EXECUTE format(
      'CREATE UNIQUE INDEX community_reports_post_reporter_unique ON %s (target_id, reporter_id) WHERE target_type = ''post''',
      v_reports
    );
  END IF;
END $$;

-- 5) 조회수 RPC — 24h dedup, 작성자 본인 조회 제외, 삭제/숨김 글 거부
CREATE OR REPLACE FUNCTION public.record_community_post_view(
  p_post_id uuid,
  p_viewer_user_id uuid DEFAULT NULL,
  p_viewer_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_author_id uuid;
  v_view_count integer;
  v_deduped boolean := false;
  v_counted boolean := false;
  v_window interval := interval '24 hours';
  v_key text := nullif(trim(p_viewer_key), '');
BEGIN
  SELECT user_id, COALESCE(view_count, 0)
  INTO v_author_id, v_view_count
  FROM public.community_posts
  WHERE id = p_post_id
    AND COALESCE(status, 'active') = 'active'
    AND COALESCE(is_hidden, false) = false
    AND COALESCE(is_deleted, false) = false;

  IF v_author_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'view_count', -1, 'deduped', false, 'counted', false);
  END IF;

  IF p_viewer_user_id IS NOT NULL AND p_viewer_user_id = v_author_id THEN
    RETURN jsonb_build_object('ok', true, 'view_count', v_view_count, 'deduped', true, 'counted', false, 'reason', 'author_self');
  END IF;

  IF p_viewer_user_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.community_post_views v
      WHERE v.post_id = p_post_id
        AND v.viewer_user_id = p_viewer_user_id
        AND v.viewed_at > now() - v_window
      LIMIT 1
    ) THEN
      v_deduped := true;
    END IF;
  ELSIF v_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.community_post_views v
      WHERE v.post_id = p_post_id
        AND v.viewer_key = v_key
        AND v.viewed_at > now() - v_window
      LIMIT 1
    ) THEN
      v_deduped := true;
    END IF;
  END IF;

  IF v_deduped THEN
    RETURN jsonb_build_object('ok', true, 'view_count', v_view_count, 'deduped', true, 'counted', false);
  END IF;

  INSERT INTO public.community_post_views (post_id, viewer_user_id, viewer_key)
  VALUES (p_post_id, p_viewer_user_id, CASE WHEN p_viewer_user_id IS NULL THEN v_key ELSE NULL END);

  UPDATE public.community_posts
  SET view_count = COALESCE(view_count, 0) + 1
  WHERE id = p_post_id
  RETURNING view_count INTO v_view_count;

  v_counted := true;
  RETURN jsonb_build_object('ok', true, 'view_count', v_view_count, 'deduped', false, 'counted', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_community_post_view(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_community_post_view(uuid, uuid, text) TO service_role;

ALTER TABLE public.community_post_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_hides ENABLE ROW LEVEL SECURITY;
