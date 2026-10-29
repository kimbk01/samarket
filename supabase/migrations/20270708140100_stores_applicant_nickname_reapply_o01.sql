-- 묶음 4 · O-01 / DB-3 — `stores.applicant_nickname` 실제 적용.
-- 운영 조회(2026-10-29, information_schema.columns): public.stores.applicant_nickname 0행.
-- 그런데 supabase_migrations.schema_migrations 에는 20260330230000_stores_applicant_nickname 기록이 있다
-- (이력과 실제 스키마 불일치) → 같은 내용을 idempotent 로 다시 적용한다.
--
-- 적용 순서: 이 마이그레이션을 먼저 운영 DB 에 적용한 뒤 앱(묶음 4 커밋)을 배포한다.
--   앱은 더 이상 「컬럼 없으면 닉네임을 빼고 저장 후 성공 응답」을 하지 않고, 컬럼이 없으면
--   503 applicant_nickname_save_failed 로 실패를 알린다.
-- 기존 행: 값 없음(null). 과거 신청 닉네임은 저장된 적이 없어 복구할 원본이 없다.
--
-- 롤백: 불필요(컬럼 추가만). 필요 시 ALTER TABLE public.stores DROP COLUMN IF EXISTS applicant_nickname;
--       (롤백하면 매장 신청 POST 가 503 이 되므로 앱 롤백과 함께만)

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS applicant_nickname text;

COMMENT ON COLUMN public.stores.applicant_nickname IS '매장 신청 시점 신청자 표시명; /my/business/apply 폼 값';
