-- 로컬/E2E: `aaaa` → 로그인 해석 `aaaa@manual.local` + 비밀번호 `1234`
-- Supabase Admin API 가 "Password should be at least 6 characters" 로 거절할 때,
-- SQL Editor(또는 `supabase db execute`)에서 1회 실행한다.
-- 이후 `node scripts/ensure-e2e-aaaa-manual-auth.mjs` 가 signIn 검증으로 비밀번호 갱신을 건너뛴다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE auth.users u
SET
  encrypted_password = crypt('1234', gen_salt('bf')),
  email_confirmed_at = coalesce(u.email_confirmed_at, now()),
  updated_at = now()
WHERE lower(u.email) = lower('aaaa@manual.local');
