import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Route Handler에서 Supabase 쿠키 JWT로 사용자 UUID 해석.
 *
 * 1) **`auth.getClaims()`** — 비대칭 JWT(Elliptic/RSA)면 JWKS 로컬 검증으로 **Auth 서버 왕복 없음** (`proxy.ts` 와 동일).
 * 2) 실패 시 **`auth.getUser()`** — 대칭 HS 등에서 Supabase가 서버 검증으로 처리.
 *
 * `getSession()`·세션 저장소의 `session.user` 는 사용하지 않음 → 라이브러리 보안 경고·쿠키만 믿는 표면 제거.
 *
 * @see https://supabase.com/docs/reference/javascript/auth-getclaims
 */
export async function resolveRouteHandlerUserIdFromSupabase(
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub =
      data?.claims && typeof data.claims === "object" && data.claims !== null && "sub" in data.claims
        ? String((data.claims as { sub?: unknown }).sub ?? "").trim()
        : "";
    if (!error && sub) return sub;
  } catch {
    /* getClaims 실패 시 getUser 폴백 */
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user?.id) return user.id;

  return null;
}
