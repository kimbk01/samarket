-- community_post engagement 후속: RLS·조회 race·신고 중복·인덱스 idempotent

-- 1) 저장·숨김 RLS (API는 service_role — 클라이언트 직접 접근 대비)
DROP POLICY IF EXISTS community_post_saves_select_own ON public.community_post_saves;
DROP POLICY IF EXISTS community_post_saves_insert_own ON public.community_post_saves;
DROP POLICY IF EXISTS community_post_saves_delete_own ON public.community_post_saves;
CREATE POLICY community_post_saves_select_own ON public.community_post_saves
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY community_post_saves_insert_own ON public.community_post_saves
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY community_post_saves_delete_own ON public.community_post_saves
  FOR DELETE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS community_post_hides_select_own ON public.community_post_hides;
DROP POLICY IF EXISTS community_post_hides_insert_own ON public.community_post_hides;
DROP POLICY IF EXISTS community_post_hides_delete_own ON public.community_post_hides;
CREATE POLICY community_post_hides_select_own ON public.community_post_hides
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY community_post_hides_insert_own ON public.community_post_hides
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY community_post_hides_delete_own ON public.community_post_hides
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 조회 기록: RPC 전용 (클라이언트 직접 INSERT 금지)
DROP POLICY IF EXISTS community_post_views_select_own ON public.community_post_views;
CREATE POLICY community_post_views_select_own ON public.community_post_views
  FOR SELECT TO authenticated USING (viewer_user_id = auth.uid());

-- 2) 신고 중복 인덱스 — legacy duplicate 정리 후 idempotent 생성
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
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = v_reports AND a.attname = 'target_type' AND NOT a.attisdropped
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD COLUMN target_type text NOT NULL DEFAULT ''post''', v_reports);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = v_reports AND a.attname = 'target_id' AND NOT a.attisdropped
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD COLUMN target_id text', v_reports);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = v_reports AND a.attname = 'reporter_id' AND NOT a.attisdropped
  ) THEN
    RAISE WARNING 'community post engagement: % lacks reporter_id — skip report dedup index', v_reports;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = v_reports AND a.attname = 'post_id' AND NOT a.attisdropped
  ) INTO v_has_post_id;

  IF v_has_post_id THEN
    EXECUTE format(
      'UPDATE %s SET target_id = post_id::text WHERE target_id IS NULL AND post_id IS NOT NULL',
      v_reports
    );
  END IF;

  EXECUTE format('UPDATE %s SET target_type = ''post'' WHERE target_type IS NULL', v_reports);

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

-- 3) 조회 RPC — 동시 요청 race 완화 (advisory xact lock)
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
  v_lock_key bigint;
BEGIN
  v_lock_key := hashtext(
    p_post_id::text || ':' || coalesce(p_viewer_user_id::text, coalesce(v_key, 'anon'))
  );
  PERFORM pg_advisory_xact_lock(v_lock_key);

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
