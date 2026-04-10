-- public.posts.thumbnail_url
-- 앱이 목록·상세·수정 API에서 SELECT/UPDATE 하는 대표 썸네일 컬럼.
-- 일부 환경에는 테이블만 있고 컬럼이 없어 PostgREST 오류가 난다.
--
-- posts 테이블이 대시보드에서만 생성된 경우가 많아, 존재할 때만 ALTER.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'posts'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS thumbnail_url text;
    COMMENT ON COLUMN public.posts.thumbnail_url IS '대표 이미지 URL. 비우면 클라이언트가 images 첫 요소 등으로 대체 가능.';
  END IF;
END $$;

-- (선택) thumbnail_url 백필 — images 컬럼 타입별로만 실행(text[] 에게 jsonb 캐스트 금지).
DO $$
DECLARE
  img_type text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'posts'
  ) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'thumbnail_url'
  ) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'images'
  ) THEN
    RETURN;
  END IF;

  SELECT pg_catalog.format_type(a.atttypid, a.atttypmod)
  INTO img_type
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'posts'
    AND a.attname = 'images'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF img_type = 'text[]' THEN
    UPDATE public.posts
    SET thumbnail_url = images[1]
    WHERE thumbnail_url IS NULL
      AND images IS NOT NULL
      AND cardinality(images) >= 1
      AND coalesce(trim(images[1]), '') <> '';
  ELSIF img_type = 'jsonb' THEN
    UPDATE public.posts
    SET thumbnail_url = images->>0
    WHERE thumbnail_url IS NULL
      AND images IS NOT NULL
      AND jsonb_typeof(images) = 'array'
      AND jsonb_array_length(images) > 0
      AND coalesce(trim(images->>0), '') <> '';
  END IF;
END $$;
