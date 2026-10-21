-- 2-F N-4B (store_settlements) — 레거시 정산 스냅샷 테이블의 service_role 쓰기 권한 회수 (SELECT 유지)
--   (G-1 §5-F · SSOT docs/store-commission-cash-settlement-ssot.md · D-5 과거 516행 무변)
--
-- 근거 (2026-10-20 확인)
--   * TS 생성 writer: lib/stores/ensure-store-settlement.ts LEGACY_STORE_SETTLEMENT_WRITER_ENABLED=false (INSERT 경로 정지).
--   * TS 수정 writer: adjustStoreSettlementOnRefund / cancelScheduledSettlementForOrder — FIN-06 이
--     apply-store-order-status-transition.ts 에서 같은 플래그 가드 아래로 이동 (=실행 안 됨).
--   * 운영 읽기 전용: 마지막 생성 2026-09-15 01:19 UTC. 권한 service_role = SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER.
--   * 운영 DB 함수 중 store_settlements 쓰기 = delivery_alert_apply_auto_action_effect 1개
--     (SECURITY DEFINER · owner postgres) → 이 회수와 무관하게 동작 유지.
--   * 관리자 데이터 리셋은 store_settlements 를 보존(preserve) 대상으로만 다룸 — DELETE 경로 없음.
--
-- 배포 순서 (필수): FIN-06 웹 반영(가드) 이 main/Production 에 먼저 나간 뒤 적용.
--   먼저 적용하면 구 웹 코드의 환불·취소 시 레거시 UPDATE 가 permission denied 로 로그 오류를 남긴다
--   (두 함수 모두 오류를 기록만 하고 상태 전이는 계속 — 금전 영향 없음).
--   운영 스크립트 scripts/delivery-financial-ssot-runtime-close.ts (service_role 로 UPDATE/INSERT) 는 이후 실패한다(의도).
--
-- 롤백 (운영 승인 후에만)
--   GRANT INSERT, UPDATE, DELETE ON TABLE public.store_settlements TO service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.store_settlements FROM service_role;
GRANT SELECT ON TABLE public.store_settlements TO service_role;
