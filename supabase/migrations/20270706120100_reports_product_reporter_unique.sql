-- RP-1 (Owner 2026-10-28 승인 §7): 같은 사람이 같은 거래 글을 두 번 신고하지 못하게 DB 에서 막는다.
-- 운영 중복 0쌍(2026-10-28 조회) — 정리 없이 인덱스만 만든다. 앱(`app/api/reports`)은 중복이면 200 `already`.
-- 롤백: DROP INDEX IF EXISTS public.uq_reports_product_reporter_target;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_product_reporter_target
  ON public.reports (reporter_id, target_id)
  WHERE target_type = 'product';
