import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * `resolveRouteHandlerAuthFromSupabase` 결과 — GET /api/me/profile 등에서
 * **동일 `SupabaseClient` 인스턴스**로 `getUser()` 중복 호출을 막기 위해 사용한다.
 */
export type ResolvedRouteHandlerAuth = {
  userId: string | null;
  /** `getUser()` 가 이미 호출되어 채워진 경우(HS 폴백 경로). */
  user: User | null;
  /** `getClaims()` 만으로 `sub` 를 얻은 경우 — 아직 `getUser()` 미호출. */
  claimsOnly: boolean;
};

/**
 * Route Handler에서 Supabase 쿠키 JWT로 사용자 UUID·User 해석.
 *
 * 1) **`auth.getClaims()`** — 비대칭 JWT(Elliptic/RSA)면 JWKS 로컬 검증으로 **Auth 서버 왕복 없음** (`proxy.ts` 와 동일).
 * 2) 실패 시 **`auth.getUser()`** — 대칭 HS 등에서 Supabase가 서버 검증으로 처리.
 *
 * `getSession()`·세션 저장소의 `session.user` 는 사용하지 않음 → 라이브러리 보안 경고·쿠키만 믿는 표면 제거.
 *
 * @see https://supabase.com/docs/reference/javascript/auth-getclaims
 */
export async function resolveRouteHandlerAuthFromSupabase(
  supabase: SupabaseClient
): Promise<ResolvedRouteHandlerAuth> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub =
      data?.claims && typeof data.claims === "object" && data.claims !== null && "sub" in data.claims
        ? String((data.claims as { sub?: unknown }).sub ?? "").trim()
        : "";
    if (!error && sub) {
      return { userId: sub, user: null, claimsOnly: true };
    }
  } catch {
    /* getClaims 실패 시 getUser 폴백 */
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!error && user?.id) {
    return { userId: user.id, user, claimsOnly: false };
  }

  return { userId: null, user: null, claimsOnly: false };
}

export async function resolveRouteHandlerUserIdFromSupabase(
  supabase: SupabaseClient
): Promise<string | null> {
  const r = await resolveRouteHandlerAuthFromSupabase(supabase);
  return r.userId;
}
