-- 최종 마무리(문서 J 후속) — 관리자 배달 실패(`delivery_failed`) 처리 503 해소.
-- 근거(운영 ckdosyydvgzqwpbwuhon 읽기 전용 조회 2026-10-21 PHT):
--   * store_order_deliveries.failure_reason 컬럼 없음. `20260517120000_delivery_riders_admin_center` 는
--     schema_migrations 에 기록돼 있으나 객체가 운영에 없음(드리프트) → lib/stores/store-order-delivery-service.ts
--     가 `failure_reason_column_missing_apply_migration` 503 반환.
--   * 같은 파일의 delivery_riders 관리 컬럼·함수 드리프트는 이 파일 범위 밖(보고만).
-- 변경: 컬럼 1개 추가(nullable, 기본값 없음). 데이터 변경 0. DROP 없음.
-- 롤백: 컬럼은 남겨 둬도 무해(이전 코드는 읽지 않음).

ALTER TABLE public.store_order_deliveries
  ADD COLUMN IF NOT EXISTS failure_reason text;

COMMENT ON COLUMN public.store_order_deliveries.failure_reason IS 'delivery_failed 시 사유(관리자/시스템)';
