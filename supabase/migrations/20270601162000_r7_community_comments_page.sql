-- R7 · 커뮤니티 댓글 관리 목록 (주제 필터 글 id 500건 · 신고 댓글 id 500건 · 닉네임 후보 200명 상한 제거)
-- 목적: /api/admin/community/engine/comments 가 주제 글 id·신고 댓글 id·닉네임 회원 id 를 후보 목록으로 먼저 모아
--       in(...) 으로 거르던 경로(각 500/500/200 에서 잘림)를 DB 한 번의 필터·정렬·페이지로 바꾼다.
-- 대상 화면: /admin/community/comments
-- 반환: { total, ids } — 현재 페이지 댓글 id(정렬 순서). 행 내용·표시 정보는 라우트가 기존 select 로 붙인다.
-- 검색(buildCommunitySearchOr 와 같은 규칙): content ILIKE p_q_pattern · (UUID 검색이 아니면) 작성자 닉네임 ILIKE ·
--   (UUID 검색이면) id/post_id/user_id 정확 일치. 패턴은 TS 가 이스케이프한 '%…%'.
-- 기간: created_at >= p_from AND created_at <= p_to (기존 gte/lte 그대로).
-- 정렬: created_at DESC, id DESC (결정적).
-- 읽기 전용. 권한: service_role 만 EXECUTE.
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_community_comments_page(uuid, text, uuid, text, timestamptz, timestamptz, text, boolean, text, uuid, integer, integer);
--   DROP INDEX IF EXISTS public.idx_community_comments_created_id;

CREATE INDEX IF NOT EXISTS idx_community_comments_created_id
  ON public.community_comments (created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.admin_community_comments_page(
  p_post_id uuid,
  p_topic_slug text,
  p_user_id uuid,
  p_status text,
  p_from timestamptz,
  p_to timestamptz,
  p_kind text,
  p_reported_only boolean,
  p_q_pattern text,
  p_q_uuid uuid,
  p_limit integer,
  p_offset integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT nullif(lower(btrim(coalesce(p_topic_slug, ''))), '') AS topic,
           nullif(btrim(coalesce(p_status, '')), '') AS status,
           nullif(btrim(coalesce(p_kind, '')), '') AS kind,
           nullif(coalesce(p_q_pattern, ''), '') AS q,
           LEAST(200, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  filtered AS (
    SELECT c.id, c.created_at
      FROM public.community_comments c
     CROSS JOIN params pr
     WHERE (p_post_id IS NULL OR c.post_id = p_post_id)
       AND (pr.topic IS NULL
            OR c.post_id IN (SELECT cp.id FROM public.community_posts cp WHERE cp.topic_slug = pr.topic))
       AND (p_user_id IS NULL OR c.user_id = p_user_id)
       AND (pr.status IS NULL OR c.status = pr.status)
       AND (p_from IS NULL OR c.created_at >= p_from)
       AND (p_to IS NULL OR c.created_at <= p_to)
       AND (pr.kind IS NULL
            OR (pr.kind = 'comment' AND c.parent_id IS NULL)
            OR (pr.kind = 'reply' AND c.parent_id IS NOT NULL)
            OR pr.kind NOT IN ('comment', 'reply'))
       -- 처리 대기 신고가 있는 댓글
       AND (NOT coalesce(p_reported_only, false)
            OR EXISTS (
                 SELECT 1 FROM public.community_reports r
                  WHERE r.target_type = 'comment'
                    AND r.status IN ('open', 'reviewing')
                    AND r.target_id = c.id::text))
       AND (pr.q IS NULL
            OR c.content ILIKE pr.q
            OR (p_q_uuid IS NULL
                AND c.user_id IN (SELECT p.id FROM public.profiles p WHERE p.nickname ILIKE pr.q))
            OR (p_q_uuid IS NOT NULL
                AND (c.id = p_q_uuid OR c.post_id = p_q_uuid OR c.user_id = p_q_uuid)))
  ),
  page AS (
    SELECT f.id, f.created_at FROM filtered f
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params)
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM filtered),
    'ids', coalesce((SELECT jsonb_agg(p.id ORDER BY p.created_at DESC, p.id DESC) FROM page p), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.admin_community_comments_page(uuid, text, uuid, text, timestamptz, timestamptz, text, boolean, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_community_comments_page(uuid, text, uuid, text, timestamptz, timestamptz, text, boolean, text, uuid, integer, integer) TO service_role;
