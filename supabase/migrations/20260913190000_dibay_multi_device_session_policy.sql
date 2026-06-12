-- DIBAY: 다중 기기 허용 — duplicate login conflict 기본 비활성
UPDATE public.auth_duplicate_login_policy
SET
  compare_same_login_id = false,
  compare_same_device = false,
  compare_same_browser = false,
  compare_same_ip = false,
  updated_at = timezone('utc', now())
WHERE id = 'default';
