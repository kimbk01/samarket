ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS application_request_note text;

COMMENT ON COLUMN public.stores.application_request_note IS
  '입점 신청자가 관리자에게 전달한 요청사항';
