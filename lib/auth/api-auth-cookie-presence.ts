import type { NextRequest } from "next/server";

/**
 * Supabase 세션 쿠키(`sb-<ref>-auth-token` · 청크 `….auth-token.0` · 구버전 `supabase.auth.token`) 존재 여부.
 * PKCE `…-code-verifier` 만 있는 요청은 로그인 진행 중일 뿐 세션이 아니므로 제외한다.
 * 쿠키 이름만 본다 — 검증은 하지 않는다 (identity 확정은 getClaims/getUser).
 */
export function requestHasSupabaseSessionCookie(request: NextRequest): boolean {
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-") && name.includes("auth-token") && !name.includes("code-verifier")) {
      return true;
    }
    if (name === "supabase.auth.token" || name.startsWith("supabase.auth.token.")) return true;
  }
  return false;
}
