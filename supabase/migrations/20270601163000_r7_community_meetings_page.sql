-- R7 · 모임 관리 목록 (개설자 닉네임 후보 200명 상한 제거)
-- 목적: /api/admin/community/engine/meetings 가 닉네임 일치 회원 id 를 200명까지만 모아 in(...) 으로 거르던 경로를
--       DB 한 번의 필터·정렬·페이지로 바꾼다.
-- 대상 화면: /admin/community/meetings (/admin/philife 모임 관리 목록 공용 API)
-- 반환: { total, ids } — 현재 페이지 모임 id(정렬 순서). 행 내용은 라우트가 기존 select 로 붙인다.
-- 탭(라우트와 동일): pending = 플랫폼 승인 대기(required) · rejected = 반려 · open = 모집 중(반려 제외) ·
--   ended = closed/ended/cancelled. p_status = 단일 상태.
-- 검색(buildCommunitySearchOr 규칙): title/region_text ILIKE · (UUID 아님) 개설자 닉네임 ILIKE ·
--   (UUID) id/post_id/host_user_id 정확 일치.
-- 정렬: created_at DESC, id DESC (결정적).
-- 읽기 전용. 권한: service_role 만 EXECUTE.
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_community_meetings_page(text, text, text, uuid, integer, integer);
--   DROP INDEX IF EXISTS public.idx_meetings_created_id;

CREATE INDEX IF NOT EXISTS idx_meetings_created_id
  ON public.meetings (created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.admin_community_meetings_page(
  p_status text,
  p_tab text,
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
    SELECT nullif(btrim(coalesce(p_status, '')), '') AS status,
           nullif(btrim(coalesce(p_tab, '')), '') AS tab,
           nullif(coalesce(p_q_pattern, ''), '') AS q,
           LEAST(200, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  filtered AS (
    SELECT m.id, m.created_at
      FROM public.meetings m
     CROSS JOIN params pr
     WHERE (pr.status IS NULL OR m.status = pr.status)
       AND (pr.tab IS NULL
            OR (pr.tab = 'pending' AND m.platform_approval_status = 'pending_approval' AND m.platform_approval_required)
            OR (pr.tab = 'rejected' AND m.platform_approval_status = 'rejected')
            OR (pr.tab = 'open' AND m.status = 'open' AND m.platform_approval_status <> 'rejected')
            OR (pr.tab = 'ended' AND m.status IN ('closed', 'ended', 'cancelled'))
            OR pr.tab NOT IN ('pending', 'rejected', 'open', 'ended'))
       AND (pr.q IS NULL
            OR m.title ILIKE pr.q
            OR m.region_text ILIKE pr.q
            OR (p_q_uuid IS NULL
                AND m.host_user_id IN (SELECT p.id FROM public.profiles p WHERE p.nickname ILIKE pr.q))
            OR (p_q_uuid IS NOT NULL
                AND (m.id = p_q_uuid OR m.post_id = p_q_uuid OR m.host_user_id = p_q_uuid)))
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

REVOKE ALL ON FUNCTION public.admin_community_meetings_page(text, text, text, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_community_meetings_page(text, text, text, uuid, integer, integer) TO service_role;
