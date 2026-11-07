-- 어드민 회원 식별 데이터 정정 — Owner 「설계안 진행」 2026-11-08 (설계안 ②⑤⑦⑧ 데이터)
-- 운영 사전 조회(2026-11-08, 읽기 전용) 대상 건수:
--   A. profiles.email = SNS 내부 주소(*.native.dibay.internal)        14  → NULL
--   B. profiles.auth_login_email = SNS 내부 주소                       14  → NULL
--   C. profiles.email = @manual.local (로그인 주소가 연락 칸에)          31  → auth_login_email 로 보존 후 NULL
--   D. Google 네이티브 회원 provider='email' (identity 는 google)        5  → provider·provider_user_id 를 identity 로
--   E. 관리자 생성 회원 provider≠admin_manual (@manual.local·SNS 없음)  26  → admin_manual
--   F. provider_user_id = 회원 자신의 ID (계약 금지값)                  45  → NULL
--   G. 관리자 변경 후에도 dibay_id_auto_assigned=true (커스텀 @id)        4  → false
--   H. @ID 없는 활성 회원                                               13  → dibay+숫자 6자리 발급 (username 은 비어 있을 때만 채움)
-- 원인 코드(재발 차단)는 같은 작업 main 반영분: member-access.ts(②⑥), 2026-10-02 54f4bcd27(⑤).
-- 전 행 백업: public.admin_identity_fix_backup_20271108 (원래 값 그대로, 되돌림용)

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_identity_fix_backup_20271108 AS
SELECT
  p.id,
  p.email,
  p.auth_login_email,
  p.provider,
  p.auth_provider,
  p.provider_user_id,
  p.dibay_id,
  p.username,
  p.username_confirmed,
  p.dibay_id_auto_assigned,
  p.dibay_id_initial,
  now() AS backed_up_at
FROM public.profiles p
WHERE p.email ILIKE '%.native.dibay.internal'
   OR p.auth_login_email ILIKE '%.native.dibay.internal'
   OR p.email ILIKE '%@manual.local'
   OR p.provider_user_id = p.id::text
   OR (p.dibay_id_auto_assigned = true AND lower(p.dibay_id) !~ '^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7})$')
   OR (p.dibay_id IS NULL AND p.deleted_at IS NULL)
   OR (lower(COALESCE(p.provider, '')) <> 'admin_manual' AND p.auth_login_email ILIKE '%@manual.local')
   OR EXISTS (
     SELECT 1 FROM public.user_auth_identities i
     WHERE i.user_id = p.id AND i.provider <> 'email'
       AND lower(COALESCE(nullif(p.auth_provider, ''), p.provider, '')) = 'email'
   );

ALTER TABLE public.admin_identity_fix_backup_20271108 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_identity_fix_backup_20271108 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admin_identity_fix_backup_20271108 TO service_role;

-- C(선행). 로그인 주소 보존 — auth_login_email 이 비어 있으면 @manual.local 을 옮긴다 (아이디 로그인 유지)
UPDATE public.profiles
SET auth_login_email = lower(btrim(email)), updated_at = now()
WHERE email ILIKE '%@manual.local'
  AND (auth_login_email IS NULL OR btrim(auth_login_email) = '');

-- A. 연락 이메일 칸의 SNS 내부 주소
UPDATE public.profiles
SET email = NULL, updated_at = now()
WHERE email ILIKE '%.native.dibay.internal';

-- B. auth_login_email 의 SNS 내부 주소 (SNS 는 비밀번호 로그인을 쓰지 않음 — 세션은 Auth 내부 주소로 발급)
UPDATE public.profiles
SET auth_login_email = NULL, updated_at = now()
WHERE auth_login_email ILIKE '%.native.dibay.internal';

-- C. 연락 이메일 칸의 @manual.local (로그인 주소는 auth_login_email 에 남음)
UPDATE public.profiles
SET email = NULL, updated_at = now()
WHERE email ILIKE '%@manual.local';

-- D. Google 네이티브 회원 — identity(SSOT) 로 미러 정정
UPDATE public.profiles p
SET
  provider = i.provider,
  auth_provider = i.provider,
  provider_user_id = i.provider_user_id,
  updated_at = now()
FROM public.user_auth_identities i
WHERE i.user_id = p.id
  AND i.provider IN ('google', 'kakao', 'apple', 'naver', 'facebook')
  AND lower(COALESCE(nullif(p.auth_provider, ''), p.provider, '')) = 'email';

-- E. 관리자 생성 회원 — @manual.local 로그인 + SNS identity 없음
UPDATE public.profiles p
SET provider = 'admin_manual', auth_provider = 'admin_manual', updated_at = now()
WHERE lower(COALESCE(p.provider, '')) <> 'admin_manual'
  AND p.auth_login_email ILIKE '%@manual.local'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_auth_identities i
    WHERE i.user_id = p.id AND i.provider <> 'email'
  );

-- F. provider_user_id 에 회원 자신의 ID (profile-identity-metadata-contract 금지값)
UPDATE public.profiles
SET provider_user_id = NULL, updated_at = now()
WHERE provider_user_id = id::text;

-- G. 관리자 변경 후 남은 자동 발급 표시
UPDATE public.profiles
SET dibay_id_auto_assigned = false, updated_at = now()
WHERE dibay_id_auto_assigned = true
  AND lower(dibay_id) !~ '^(dibay_[a-f0-9]{6}|dibay[0-9]{6,7})$';

-- H. @ID 없는 활성 회원 — dibay + 숫자 6자리 (username 은 관리자 생성 로그인 별칭일 수 있어 비어 있을 때만 채움)
DO $$
DECLARE
  r record;
  v_candidate text;
  v_attempt int;
BEGIN
  FOR r IN
    SELECT id, username FROM public.profiles
    WHERE dibay_id IS NULL AND deleted_at IS NULL
    ORDER BY created_at
  LOOP
    v_attempt := 0;
    LOOP
      v_attempt := v_attempt + 1;
      IF v_attempt > 48 THEN
        RAISE EXCEPTION 'dibay_id backfill collision exhausted for %', r.id;
      END IF;
      v_candidate := 'dibay' || lpad(floor(random() * 1000000)::bigint::text, 6, '0');
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.dibay_id_key = v_candidate
           OR regexp_replace(lower(btrim(p.username)), '[._]', '', 'g') = v_candidate
      );
    END LOOP;

    UPDATE public.profiles
    SET
      dibay_id = v_candidate,
      dibay_id_auto_assigned = true,
      dibay_id_initial = v_candidate,
      dibay_id_changed_once = false,
      dibay_id_locked = false,
      username = COALESCE(nullif(btrim(username), ''), v_candidate),
      username_confirmed = CASE WHEN nullif(btrim(username), '') IS NULL THEN true ELSE username_confirmed END,
      updated_at = now()
    WHERE id = r.id;
  END LOOP;
END;
$$;

COMMIT;
