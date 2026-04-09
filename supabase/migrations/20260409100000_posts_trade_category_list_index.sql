-- 거래 목록: trade_category_id + 정렬 컬럼 인덱스 (숨김·판매완료 제외 조회에 유리)
-- posts 테이블이 없는 환경에서는 no-op

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'posts'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'trade_category_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS posts_trade_category_created_at_list_idx
      ON public.posts (trade_category_id, created_at DESC)
      WHERE status IS DISTINCT FROM 'hidden' AND status IS DISTINCT FROM 'sold';
  END IF;
END $$;
