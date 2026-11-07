-- Sign in with Apple 토큰 폐기용 저장소 (Owner 2026-11-07 「웹·DB 수정 시작」 · docs/audit/ios-appstore-defects-fixplan-2026-11-07.md D2)
--
-- App Store 계정 삭제 요구: Sign in with Apple 을 쓰는 앱은 탈퇴 시 REST API 로 사용자 토큰을 폐기해야 한다.
-- 네이티브 Apple 로그인 직후 서버가 authorizationCode 를 refresh_token 으로 교환해 암호화(AES-256-GCM) 저장하고,
-- 회원 삭제 처리 때 Apple /auth/revoke 호출 후 행을 지운다 (lib/auth/native/apple-siwa-token.server.ts).
-- 접근: service role 만. 클라이언트 역할(anon·authenticated)은 읽기·쓰기 모두 불가.
-- 롤백: DROP TABLE public.apple_signin_tokens; (코드는 테이블이 없으면 저장·폐기를 건너뛰고 로그인·탈퇴는 그대로 진행)

CREATE TABLE IF NOT EXISTS public.apple_signin_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id text NOT NULL CHECK (char_length(client_id) BETWEEN 1 AND 200),
  refresh_token_enc text NOT NULL CHECK (char_length(refresh_token_enc) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.apple_signin_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.apple_signin_tokens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apple_signin_tokens TO service_role;

COMMENT ON TABLE public.apple_signin_tokens IS
  'Sign in with Apple refresh token (암호화) — 탈퇴 시 Apple /auth/revoke 용. service role 전용.';
