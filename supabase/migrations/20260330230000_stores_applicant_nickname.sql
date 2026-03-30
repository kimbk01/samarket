-- 매장 신청 시 신청자 닉네임(프로필과 다를 수 있음). 기존 DB에 수동 적용 가능.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS applicant_nickname text;

COMMENT ON COLUMN public.stores.applicant_nickname IS '매장 신청 시점 신청자 표시명; /my/business/apply 폼 값';
