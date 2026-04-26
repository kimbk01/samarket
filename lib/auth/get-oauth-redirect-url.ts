import { withNextSearchParam } from "@/lib/auth/safe-next-path";

/**
 * OAuth signInWithOAuth 의 `redirectTo` 를 만든다.
 * - 동일 출처의 `/auth/callback` 만 사용한다 (Supabase Site URL whitelist 와 일치).
 * - `next` 가 안전한 내부 경로면 `?next=` 로 보존해 콜백이 최종 라우트를 복원할 수 있게 한다.
 */
export function buildOAuthRedirectUrl(
  origin: string,
  next?: string | null
): string {
  return withNextSearchParam(`${origin}/auth/callback`, next);
}
