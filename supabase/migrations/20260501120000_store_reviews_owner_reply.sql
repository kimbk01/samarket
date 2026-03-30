-- 매장 리뷰: 사장님 답글 컬럼 추가

ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS owner_reply_content text;

ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS owner_reply_created_at timestamptz;

ALTER TABLE public.store_reviews
  ADD COLUMN IF NOT EXISTS owner_reply_owner_user_id uuid;

COMMENT ON COLUMN public.store_reviews.owner_reply_content IS '사장님 답글 본문';
COMMENT ON COLUMN public.store_reviews.owner_reply_created_at IS '사장님 답글 작성 시각';
COMMENT ON COLUMN public.store_reviews.owner_reply_owner_user_id IS '답글 작성한 사장님 user id';
