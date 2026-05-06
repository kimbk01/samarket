-- 플랫폼 관리자 주문 운영 플래그 (원장 단일 소스)
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS admin_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS admin_flagged boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS admin_note text;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS refund_approved_at timestamptz;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS dispute_status text;

COMMENT ON COLUMN public.store_orders.admin_locked IS '관리자 주문 잠금 — 오너/구매자 상태 변경 차단';
COMMENT ON COLUMN public.store_orders.admin_flagged IS '관리자 경고·주목 플래그';
COMMENT ON COLUMN public.store_orders.admin_note IS '관리자 운영 메모(내부)';
COMMENT ON COLUMN public.store_orders.refund_approved_at IS '관리자 환불 승인 처리 시각';
COMMENT ON COLUMN public.store_orders.refunded_at IS '원장 환불 완료 시각';
COMMENT ON COLUMN public.store_orders.dispute_status IS '분쟁·긴급 처리 상태 코드(자유 텍스트, 짧게)';
