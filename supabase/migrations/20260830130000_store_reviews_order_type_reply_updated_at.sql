-- 매장 리뷰: 주문 방식 태그 + 사장님 답글 수정 시각 추가

ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS order_type text;

COMMENT ON COLUMN public.store_reviews.order_type IS '주문 방식: delivery | pickup | null';

ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS owner_reply_updated_at timestamptz;

COMMENT ON COLUMN public.store_reviews.owner_reply_updated_at IS '사장님 답글 마지막 수정 시각 (최초 작성은 owner_reply_created_at)';
