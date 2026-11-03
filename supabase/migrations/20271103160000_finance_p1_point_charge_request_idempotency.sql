-- 금융 P1 (Owner 2026-11-03 「DB 2건 승인」) — 회원 포인트 충전 신청 서버 중복 방지 키.
-- 이전: 클라이언트 연타 가드만 있어서, 응답 유실 후 재시도·다른 기기 동시 제출 시 같은 입금 1건에 신청이 2건 생길 수 있었다.
-- 변경: idempotency_key 열 + (user_id, idempotency_key) 부분 고유 인덱스. 기존 행은 NULL 그대로 (변경 없음).
-- API(/api/me/points/charge) 가 같은 키 재요청이면 기존 신청을 그대로 돌려준다.

BEGIN;

ALTER TABLE public.point_charge_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS point_charge_requests_user_idempotency_uidx
  ON public.point_charge_requests (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.point_charge_requests.idempotency_key IS
  'P1: one key per member submission — retries return the same request (no duplicate charge request).';

COMMIT;
