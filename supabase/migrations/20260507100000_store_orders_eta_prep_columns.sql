-- 매장 접수(accepted) 시 예상 조리·준비 시간 원장 (오너 입력 → 서버 시각 기준 계산)
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS estimated_prep_minutes integer;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS estimated_ready_at timestamptz;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

COMMENT ON COLUMN public.store_orders.estimated_prep_minutes IS '오너 접수 시 선택한 예상 준비 시간(분), 1–180';
COMMENT ON COLUMN public.store_orders.estimated_ready_at IS '서버 기준 예상 준비 완료 시각(accepted 시점 + 분)';
COMMENT ON COLUMN public.store_orders.accepted_at IS '오너가 pending→accepted 로 접수한 시각';
