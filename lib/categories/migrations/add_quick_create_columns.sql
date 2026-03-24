-- Quick Create Launcher용 categories 컬럼 추가
-- Supabase SQL Editor에서 실행

-- 1) slug unique (이미 있으면 스킵. 없으면 아래 한 줄만 실행)
-- CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_unique ON categories (slug) WHERE slug IS NOT NULL AND slug <> '';

-- 2) Quick Create 컬럼 추가 (PostgreSQL 9.5+)
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS quick_create_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quick_create_group text,
  ADD COLUMN IF NOT EXISTS quick_create_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS show_in_home_chips boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN categories.quick_create_enabled IS '글쓰기 런처(하단 + 버튼) 노출 여부';
COMMENT ON COLUMN categories.quick_create_group IS 'content | trade';
COMMENT ON COLUMN categories.quick_create_order IS '런처 내 정렬 순서';
COMMENT ON COLUMN categories.show_in_home_chips IS '홈 상단 카테고리 칩 노출. false면 칩에는 안 보이고 런처에만 노출 가능';
