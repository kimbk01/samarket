-- transaction_reviews: 동일 거래방(room)·작성자(reviewer)당 후기 1건 (앱 로직·409 중복과 정합)
-- 테이블이 없으면 전체 스킵 (초기/부분 스키마 DB 호환)

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'transaction_reviews'
  ) THEN
    RAISE NOTICE 'transaction_reviews: table missing, skip unique index';
    RETURN;
  END IF;

  DELETE FROM public.transaction_reviews AS a
  USING public.transaction_reviews AS b
  WHERE a.room_id IS NOT NULL
    AND b.room_id IS NOT NULL
    AND a.room_id = b.room_id
    AND a.reviewer_id = b.reviewer_id
    AND a.id::text > b.id::text;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'transaction_reviews_room_id_reviewer_id_key'
  ) THEN
    CREATE UNIQUE INDEX transaction_reviews_room_id_reviewer_id_key
      ON public.transaction_reviews (room_id, reviewer_id);
  END IF;
END;
$migration$;
