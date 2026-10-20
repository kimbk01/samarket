-- R7 · 경고·활동 제한 목록 (닉네임 후보 200명 상한 제거)
-- 목적: /api/admin/community/restrictions 가 닉네임 일치 회원 id 를 200명까지만 모아 in(...) 으로 거르던 경로를
--       DB 한 번의 필터·정렬·페이지로 바꾼다. sanctions.user_id 는 auth.users FK 라 profiles 임베드 조인이 불가 → RPC.
-- 대상 화면: /admin/community/restrictions (p_scope = 'community'). 범위(scope) 인자로 거래 제한 목록도 재사용 가능.
-- 상태(라우트와 동일, 기준 시각 = now()): active = 미해제 AND (end_at 없음 OR end_at > now) ·
--   expired = 미해제 AND end_at <= now · revoked = 해제됨 · all = 전체.
-- 검색: 대상 회원 닉네임 ILIKE p_q_pattern (TS 가 만든 '%…%').
-- 반환: { total, ids } — 현재 페이지 제재 id(정렬 순서). 정렬: created_at DESC, id DESC (결정적).
-- 읽기 전용. 권한: service_role 만 EXECUTE.
-- 롤백:
--   DROP FUNCTION IF EXISTS public.admin_sanctions_page(text, text, text, uuid, text, integer, integer);
--   DROP INDEX IF EXISTS public.idx_sanctions_scope_created_id;

CREATE INDEX IF NOT EXISTS idx_sanctions_scope_created_id
  ON public.sanctions (scope, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.admin_sanctions_page(
  p_scope text,
  p_status text,
  p_kind text,
  p_user_id uuid,
  p_q_pattern text,
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
    SELECT coalesce(nullif(btrim(coalesce(p_status, '')), ''), 'all') AS status,
           nullif(btrim(coalesce(p_kind, '')), '') AS kind,
           nullif(coalesce(p_q_pattern, ''), '') AS q,
           now() AS as_of,
           LEAST(100, GREATEST(1, coalesce(p_limit, 50))) AS lim,
           GREATEST(0, coalesce(p_offset, 0)) AS off
  ),
  filtered AS (
    SELECT s.id, s.created_at
      FROM public.sanctions s
     CROSS JOIN params pr
     WHERE s.scope = p_scope
       AND (pr.kind IS NULL OR s.sanction_type = pr.kind)
       AND (p_user_id IS NULL OR s.user_id = p_user_id)
       AND (pr.q IS NULL OR s.user_id IN (SELECT p.id FROM public.profiles p WHERE p.nickname ILIKE pr.q))
       AND (CASE pr.status
              WHEN 'active' THEN s.revoked_at IS NULL AND (s.end_at IS NULL OR s.end_at > pr.as_of)
              WHEN 'expired' THEN s.revoked_at IS NULL AND s.end_at <= pr.as_of
              WHEN 'revoked' THEN s.revoked_at IS NOT NULL
              ELSE true
            END)
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

REVOKE ALL ON FUNCTION public.admin_sanctions_page(text, text, text, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sanctions_page(text, text, text, uuid, text, integer, integer) TO service_role;
