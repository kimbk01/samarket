import { withFreshLoginNextSearchParam } from "@/lib/auth/safe-next-path";

/**
 * OAuth signInWithOAuth 의 `redirectTo` 를 만든다.
 * - 동일 출처의 `/auth/callback` 만 사용한다 (Supabase Site URL whitelist 와 일치).
 * - `next` 는 탭 루트만 callback 으로 전달(deep link 복원 금지).
 */
export function buildOAuthRedirectUrl(
  origin: string,
  next?: string | null
): string {
  return withFreshLoginNextSearchParam(`${origin}/auth/callback`, next);
}
