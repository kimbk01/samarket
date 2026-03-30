/**
 * Supabase 로그인(이메일·OAuth) 성공 후 기본 진입 경로.
 * - `app/login`, `app/auth/callback` 의 기본 `next` 와 반드시 동일해야 함.
 * - 회원가입·이메일 인증 등은 URL `next` 로 `/my/account` 등을 별도 전달.
 *
 * 참고: `proxy.ts` 가 붙이는 `?next=` 는 미인증 접근 원 경로이며,
 * 현재 로그인 페이지는 성공 후 이 상수로만 이동한다.
 */
export const POST_LOGIN_PATH = "/home" as const;
