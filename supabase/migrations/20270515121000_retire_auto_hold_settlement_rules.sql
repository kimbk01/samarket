-- C-9 (Owner 승인) · DEF-4: 레거시 정산 보류 자동 조치(`auto_hold_settlement`) 중단.
-- 직접 결제 모델에서 `store_settlements` 는 지급 큐가 아니며(수수료 SSOT = DB 트리거), 신규 행 생성도 중단됐다
-- (lib/stores/ensure-store-settlement.ts LEGACY_STORE_SETTLEMENT_WRITER_ENABLED=false).
-- 이 규칙의 자동 실행만 끈다 — 규칙 행·실행 기록(delivery_operation_alert_actions)·정산 스냅샷은 보존한다.
-- 관리자 API 는 이 유형을 새로 지정할 수 없다 (auto_action_type_retired).
-- **운영 DB 적용은 Owner 배포 승인 후.**

UPDATE public.delivery_operation_alert_rules
   SET auto_action_enabled = false
 WHERE auto_action_type = 'auto_hold_settlement'
   AND auto_action_enabled = true;
