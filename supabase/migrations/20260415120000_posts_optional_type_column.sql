-- posts.type: 일부 환경에서 컬럼이 없어 PostgREST SELECT/WHERE 시 오류가 났음.
-- 앱은 trade_category_id·board_id·service_id 로도 구분하므로 필수는 아님.
-- 선택적으로 컬럼만 추가(값 백필 없음). 향후 trade|community|service|feature 구분용.
--
-- posts 테이블이 이 저장소 마이그레이션에 없고 대시보드에서만 만든 경우가 많아,
-- 테이블이 있을 때만 ALTER 하도록 둔다(없으면 이 파일은 no-op).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'posts'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS type text;
    COMMENT ON COLUMN public.posts.type IS '선택: trade | community | service | feature (미설정 시 trade_category_id 등으로 판별)';
  END IF;
END $$;
