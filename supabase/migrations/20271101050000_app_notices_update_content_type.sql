-- 알림 최종 설계 S7 · D6 (Owner 승인 2026-11-01 「DB 변경 승인」)
-- 고객센터 게시판에 「업데이트 소식」(content_type = 'update') 추가 + 업데이트 글의 앱 버전 입력란.
-- 기존 행·기존 값(notice·system·marketing)은 바꾸지 않는다. 롤백: 아래 down 주석 참고.

ALTER TABLE public.app_notices
  DROP CONSTRAINT IF EXISTS app_notices_content_type_check;

ALTER TABLE public.app_notices
  ADD CONSTRAINT app_notices_content_type_check
  CHECK (content_type IN ('notice', 'system', 'marketing', 'update'));

ALTER TABLE public.app_notices
  ADD COLUMN IF NOT EXISTS app_version text NULL;

ALTER TABLE public.app_notices
  DROP CONSTRAINT IF EXISTS app_notices_app_version_len;

ALTER TABLE public.app_notices
  ADD CONSTRAINT app_notices_app_version_len
  CHECK (app_version IS NULL OR char_length(app_version) <= 32);

COMMENT ON COLUMN public.app_notices.app_version IS
  '업데이트 소식(content_type=update) 글의 앱 버전 표시값 (예: 2.4.0). 그 외 종류는 NULL.';

-- down (수동 롤백 · update 행이 없을 때만):
--   ALTER TABLE public.app_notices DROP CONSTRAINT IF EXISTS app_notices_app_version_len;
--   ALTER TABLE public.app_notices DROP COLUMN IF EXISTS app_version;
--   ALTER TABLE public.app_notices DROP CONSTRAINT IF EXISTS app_notices_content_type_check;
--   ALTER TABLE public.app_notices ADD CONSTRAINT app_notices_content_type_check
--     CHECK (content_type IN ('notice', 'system', 'marketing'));
