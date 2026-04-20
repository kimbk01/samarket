-- =============================================================================
-- 커뮤니티 레거시 public.posts 메타 백필 — 사전 조사 (읽기 전용)
-- 앱 계약: type='community' + meta.board_id (+ 선택 meta.board_category_id)
-- 실행: Supabase SQL Editor → 복사 후 실행. 결과 행 수·스칼라를 스테이징 기록용으로 저장.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) posts 테이블에 레거시 컬럼이 있는지 (환경마다 다름 — 저장소 DDL에 없을 수 있음)
-- ---------------------------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'board_id'
  ) AS posts_has_board_id_column,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'board_category_id'
  ) AS posts_has_board_category_id_column,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'service_id'
  ) AS posts_has_service_id_column,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'posts'
      AND c.column_name = 'visibility'
  ) AS posts_has_visibility_column,
  EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'community_topics'
      AND c.column_name = 'board_id'
  ) AS community_topics_has_board_id_column;

-- ---------------------------------------------------------------------------
-- B) "커뮤니티 후보" 집합 정의 (백필·카운트 공통 기준)
--    - 명시: type = 'community'
--    - 레거시: type 비어 있고 community_topic_id 가 있는 행 (필라이프·동네 주제 글)
--    (필요 시 운영에서 OR 조건 확장: 예) 레거시 board_id 컬럼만 있는 행)
-- ---------------------------------------------------------------------------
WITH communityish AS (
  SELECT
    p.id,
    p.type,
    p.meta,
    p.community_topic_id,
    p.trade_category_id
  FROM public.posts p
  WHERE
    p.type = 'community'
    OR (
      coalesce(trim(p.type), '') = ''
      AND p.community_topic_id IS NOT NULL
    )
),
typed AS (
  SELECT * FROM communityish c WHERE coalesce(trim(c.type), '') = ''
),
meta_missing_board AS (
  SELECT *
  FROM communityish c
  WHERE
    c.meta IS NULL
    OR c.meta->>'board_id' IS NULL
    OR trim(c.meta->>'board_id') = ''
),
meta_missing_board_cat AS (
  SELECT *
  FROM communityish c
  WHERE
    c.meta IS NULL
    OR c.meta->>'board_category_id' IS NULL
    OR trim(c.meta->>'board_category_id') = ''
)
SELECT
  (SELECT count(*)::bigint FROM communityish) AS community_candidate_rows,
  (SELECT count(*)::bigint FROM typed) AS type_empty_among_candidates,
  (SELECT count(*)::bigint FROM meta_missing_board) AS meta_board_id_missing_among_candidates,
  (SELECT count(*)::bigint FROM meta_missing_board_cat) AS meta_board_category_id_missing_among_candidates;

-- ---------------------------------------------------------------------------
-- C) 조사 4) 레거시 컬럼에서 meta 보감 가능 행 수 (컬럼 없으면 NOTICE 만)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  has_board_id boolean;
  has_board_cat boolean;
  n1 bigint;
  n2 bigint;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'posts' AND c.column_name = 'board_id'
  ) INTO has_board_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'posts' AND c.column_name = 'board_category_id'
  ) INTO has_board_cat;

  IF has_board_id THEN
    EXECUTE $q$
      SELECT count(*)::bigint
      FROM public.posts p
      WHERE p.board_id IS NOT NULL
        AND trim(p.board_id::text) <> ''
        AND (
          p.meta IS NULL
          OR p.meta->>'board_id' IS NULL
          OR trim(p.meta->>'board_id') = ''
        )
    $q$ INTO n1;
    RAISE NOTICE '[조사4] legacy posts.board_id 채워져 있으나 meta.board_id 비움: % 건', n1;
  ELSE
    RAISE NOTICE '[조사4] public.posts.board_id 컬럼 없음 — 레거시 컬럼에서의 유추 불가(다른 소스 필요)';
  END IF;

  IF has_board_cat THEN
    EXECUTE $q$
      SELECT count(*)::bigint
      FROM public.posts p
      WHERE p.board_category_id IS NOT NULL
        AND trim(p.board_category_id::text) <> ''
        AND (
          p.meta IS NULL
          OR p.meta->>'board_category_id' IS NULL
          OR trim(p.meta->>'board_category_id') = ''
        )
    $q$ INTO n2;
    RAISE NOTICE '[조사4] legacy posts.board_category_id 채워져 있으나 meta.board_category_id 비움: % 건', n2;
  ELSE
    RAISE NOTICE '[조사4] public.posts.board_category_id 컬럼 없음';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D) 조사 5) community_topic_id ↔ board 매핑 — 스키마 단서
--    저장소 기본 스키마: community_topics 는 section_id (community_sections) 기준.
--    boards 는 service_id 기준. 직접 FK는 없음 → 아래는 "겹치는 slug" 등 휴리스틱 점검용 샘플.
-- ---------------------------------------------------------------------------
-- D-1) 주제별 행 수 (커뮤니티 후보 중 community_topic_id 가 있는 것)
SELECT
  p.community_topic_id,
  count(*)::bigint AS post_count
FROM public.posts p
WHERE
  p.type = 'community'
  OR (coalesce(trim(p.type), '') = '' AND p.community_topic_id IS NOT NULL)
GROUP BY 1
ORDER BY post_count DESC
LIMIT 40;

-- D-2) community_topics ↔ community_sections (주제가 어느 섹션인지)
SELECT
  t.id AS topic_id,
  t.slug AS topic_slug,
  s.id AS section_id,
  s.slug AS section_slug
FROM public.community_topics t
JOIN public.community_sections s ON s.id = t.section_id
WHERE t.is_active IS NOT FALSE
ORDER BY s.sort_order, t.sort_order
LIMIT 200;

-- D-3) boards (동네생활 서비스) — slug 나 id 를 수동 매핑표로 쓸 때 참고
SELECT b.id AS board_id, b.slug AS board_slug, b.name
FROM public.boards b
JOIN public.services s ON s.id = b.service_id
WHERE s.slug = 'community'
  AND coalesce(b.is_active, true)
ORDER BY b.sort_order;

-- =============================================================================
-- E) 백필 UPDATE 초안 (운영 적용 전 반드시 스테이징에서 검증·BEGIN/ROLLBACK 드라이런)
-- 규칙 예시 — 환경에 맞게 상수·WHERE 조건 조정:
--
-- 1) type 만:
--    UPDATE public.posts p SET type = 'community'
--    WHERE (coalesce(trim(p.type), '') = '' AND p.community_topic_id IS NOT NULL);
--
-- 2) 레거시 컬럼 → meta (컬럼 있을 때만 실행):
--    UPDATE public.posts p
--    SET meta = coalesce(p.meta, '{}'::jsonb) || jsonb_build_object('board_id', p.board_id::text)
--    WHERE p.board_id IS NOT NULL AND trim(p.board_id::text) <> ''
--      AND (p.meta->>'board_id' IS NULL OR trim(p.meta->>'board_id') = '');
--
-- 3) 단일 기본 게시판(운영에서 게시판이 하나뿐일 때) 휴리스틱:
--    UPDATE public.posts p SET meta = coalesce(p.meta,'{}'::jsonb) || jsonb_build_object('board_id','<uuid>')
--    WHERE p.type = 'community' AND (p.meta->>'board_id' IS NULL OR trim(p.meta->>'board_id') = '');
--
-- 4) meta 병합 시 기존 키 보존: 항상 coalesce(meta,'{}') || jsonb_build_object(...)
-- =============================================================================
