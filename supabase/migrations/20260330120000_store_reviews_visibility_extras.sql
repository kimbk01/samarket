-- 매장 리뷰: 사진 URL, 메뉴별 만족도(썸업/다운), 사장님 전용(비공개) 노출
-- store_reviews 테이블이 이미 있는 환경에서만 적용하세요.

ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS visible_to_public boolean NOT NULL DEFAULT true;

ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS item_feedback jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.store_reviews.visible_to_public IS 'false면 매장 공개 리뷰 목록에 노출하지 않음(사장님·운영 검수용)';
COMMENT ON COLUMN public.store_reviews.item_feedback IS 'JSON: store_order_items.id -> "up" | "down"';
