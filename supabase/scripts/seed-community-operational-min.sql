-- =============================================================================
-- 동네생활 커뮤니티 보드 최소 운영 시드 (SQL Editor 수동 실행용)
-- 앱 계약: `services.slug = 'community'` + `boards` 최소 1행 + 글은 `meta.board_id`
-- (`lib/community-board/api.ts` — 목록은 meta->>board_id + type=community)
--
-- 실행 전: 대시보드 또는 information_schema 로 `services` / `boards` / `board_categories`
-- 컬럼명이 아래와 같은지 확인하고, 다르면 이 스크립트만 조정한다.
-- =============================================================================

-- 1) community 서비스 (없을 때만) — `service_type` NOT NULL 인 DB 가 많아 동일 값으로 둔다.
INSERT INTO public.services (slug, name, is_active, service_type)
SELECT 'community', '동네생활', true, 'community'
WHERE NOT EXISTS (
  SELECT 1 FROM public.services s WHERE s.slug = 'community'
);

-- 2) 기본 게시판 1개 — slug 는 URL·운영 규칙에 맞게 바꿔도 됨 (글 meta.board_id 와 일치해야 함)
INSERT INTO public.boards (
  service_id,
  name,
  slug,
  description,
  skin_type,
  form_type,
  category_mode,
  policy,
  is_active,
  sort_order
)
SELECT
  s.id,
  '동네생활',
  'neighborhood',
  NULL,
  'basic',
  'basic',
  'none',
  '{"allow_comment":true,"allow_like":true,"allow_report":true}'::jsonb,
  true,
  0
FROM public.services s
WHERE s.slug = 'community'
  AND coalesce(s.is_active, true)
  AND NOT EXISTS (
    SELECT 1
    FROM public.boards b
    WHERE b.service_id = s.id
  );

-- 3) category_mode = 'board_category' 인 게시판만 board_categories 필수.
--    위에서는 category_mode = 'none' 이므로 생략 가능.
--
-- 4) 검증용 (선택): 생성된 board id 확인 후 샘플 글 meta 에 동일 UUID 를 넣는다.
--    SELECT id, slug FROM public.boards b
--    JOIN public.services s ON s.id = b.service_id
--    WHERE s.slug = 'community';
