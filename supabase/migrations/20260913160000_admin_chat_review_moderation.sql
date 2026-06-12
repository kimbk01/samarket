-- 어드민 채팅 메모·거래 후기 숨김 (mock 제거)

BEGIN;

ALTER TABLE public.chat_rooms
  ADD COLUMN IF NOT EXISTS admin_memo text NOT NULL DEFAULT '';

ALTER TABLE public.transaction_reviews
  ADD COLUMN IF NOT EXISTS is_hidden_by_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.chat_rooms.admin_memo IS '관리자 내부 메모 (채팅방)';
COMMENT ON COLUMN public.transaction_reviews.is_hidden_by_admin IS '관리자 숨김 처리';

COMMIT;
