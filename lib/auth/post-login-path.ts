/**
 * Supabase 로그인(이메일·OAuth) 성공 후 기본 진입 경로.
 * - `app/login` 이메일 로그인·테스트 로그인·`app/auth/callback`(next 미지정 시) 과 동일해야 함.
 * - 미인증 시 `/login` 은 쿼리 없이 열고(`proxy.ts`, `SessionLostRedirect`, `buildLoginHref`),
 *   성공 후에는 이 경로로만 이동해 세션·게이트와 맞춘다.
 */
export const POST_LOGIN_PATH = "/home" as const;
