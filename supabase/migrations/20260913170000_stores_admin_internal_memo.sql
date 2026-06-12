-- 매장 어드민 내부 메모 (비즈니스 어드민 mock 제거)

BEGIN;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS admin_internal_memo text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.stores.admin_internal_memo IS '관리자 내부 메모 (매장)';

COMMIT;
