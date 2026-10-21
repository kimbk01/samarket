-- 최종 마무리 — 배달 상태 CHECK 제약 검증 (1단계에서 NOT VALID 로 추가).
-- 운영 읽기 전용 확인 2026-10-21 PHT: 허용 목록 밖 delivery_status 행 0건.
-- 데이터 변경 0. 제약 정의 불변(검증 플래그만).
ALTER TABLE public.store_order_deliveries VALIDATE CONSTRAINT store_order_deliveries_status_check;
