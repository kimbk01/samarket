-- 배달 오너 감사 2단계 2-A · N-4B (business_cash_charge_requests) (문서 G-1 §4-D N-4B, §5-A FIN-04)
-- 선행: 20270603110100 (owner_create_business_cash_charge_request RPC) 적용 + 웹(main) 배포 —
--   웹이 요청 생성을 RPC 로 바꾼 뒤에만 적용한다(이전 웹은 service_role TS INSERT 를 쓴다).
-- 근거: TS 쓰기 0건 확인(grep: lib/stores/advertising/canonical-business-cash-writer.ts 의 .insert 제거,
--   그 밖의 .from(BUSINESS_CASH_CHARGE_REQUESTS_TABLE) 은 전부 SELECT). 상태 변경은 approve/reject RPC
--   (SECURITY DEFINER · 소유자 postgres) 만. 운영 권한(2026-10-21): service_role = INSERT, SELECT, UPDATE, DELETE.
--   (scripts/qa/currency-cut-g-production-close.mjs 는 과거 QA 1회용 스크립트로 직접 INSERT 를 쓴다 — 이 적용 후 동작하지 않음.)
-- 수정:
--   1) REVOKE INSERT, UPDATE, DELETE ON business_cash_charge_requests FROM service_role (SELECT 유지).
--   2) 신규 PENDING 행은 결제수단·입금 참조번호 필수 — CHECK ... NOT VALID (기존 27행 검증 안 함, D-5).
--      PENDING 이 아닌 상태로의 갱신(승인·반려)은 통과하므로 과거 형식 행의 결정도 막지 않는다.
-- 데이터 변경 없음.
-- 롤백:
--   ALTER TABLE public.business_cash_charge_requests DROP CONSTRAINT IF EXISTS business_cash_charge_requests_pending_evidence_chk;
--   GRANT INSERT, UPDATE, DELETE ON public.business_cash_charge_requests TO service_role;

REVOKE INSERT, UPDATE, DELETE ON public.business_cash_charge_requests FROM service_role;

ALTER TABLE public.business_cash_charge_requests
  DROP CONSTRAINT IF EXISTS business_cash_charge_requests_pending_evidence_chk;
ALTER TABLE public.business_cash_charge_requests
  ADD CONSTRAINT business_cash_charge_requests_pending_evidence_chk
  CHECK (status <> 'PENDING' OR (payment_method IS NOT NULL AND payment_reference IS NOT NULL)) NOT VALID;
