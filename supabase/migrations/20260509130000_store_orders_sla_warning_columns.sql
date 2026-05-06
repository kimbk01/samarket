-- SLA warning columns for store_orders (v1)
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS sla_warning_level text;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS sla_warning_reason text;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS sla_warning_at timestamptz;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS needs_admin_attention boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_orders.sla_warning_level IS 'SLA 경고 레벨: none|info|warning|critical (문자열)';
COMMENT ON COLUMN public.store_orders.sla_warning_reason IS 'SLA 경고 사유 코드 (짧은 문자열)';
COMMENT ON COLUMN public.store_orders.sla_warning_at IS 'SLA 경고 최초/최종 감지 시각';
COMMENT ON COLUMN public.store_orders.needs_admin_attention IS '관리자 운영 큐에 올릴지 여부';

