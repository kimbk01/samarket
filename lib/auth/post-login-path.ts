/**
 * Supabase 로그인(이메일·OAuth) 성공 후 기본 진입 경로.
 * - 로그인 성공·이미 로그인 상태에서 `/login` 접근·`/auth/callback` next 미지정·온보딩 완료 후 모두
 *   이 경로로 통일한다 (스펙: 1·E, 2, 6, 7, 9).
 * - 미인증 시 `/login` 은 `?next=` 가 검증된 경우에만 부착된다 (`safe-next-path.ts`).
 */
export const POST_LOGIN_PATH = "/home" as const;
