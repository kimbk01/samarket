import type { User } from "@supabase/supabase-js";
import { isAuthError } from "@supabase/auth-js";

/**
 * Supabase `auth.getUser()` 가 사용자 없음을 돌려줄 때, 클라이언트 프로필 캐시를 비울지 판별한다.
 * - 네트워크·5xx·타임아웃 등 일시 실패에서는 캐시를 유지해 "가짜 로그아웃"을 막는다.
 * - 세션 만료·리프레시 실패 등 확실한 인증 종료에서만 비운다.
 */
export function shouldClearProfileCacheOnGetUserFailure(
  user: User | null | undefined,
  error: { message?: string; status?: number; code?: string } | null | undefined
): boolean {
  if (user?.id) return false;
  if (!error) return true;

  const status = typeof error.status === "number" ? error.status : undefined;
  if (status === 429) return false;
  if (status != null && status >= 500) return false;

  const code = String(error.code ?? "").trim().toLowerCase();
  const msg = String(error.message ?? "").toLowerCase();

  if (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("timeout") ||
    msg.includes("load failed") ||
    msg.includes("econnreset")
  ) {
    return false;
  }

  if (code === "request_timeout" || code === "unexpected_failure") {
    return false;
  }

  if (status === undefined && !isAuthError(error)) {
    return false;
  }

  if (status === 401 || status === 403) return true;

  const terminalCodes = new Set([
    "bad_jwt",
    "session_not_found",
    "session_expired",
    "refresh_token_not_found",
    "refresh_token_already_used",
    "user_not_found",
    "no_authorization",
  ]);
  if (code && terminalCodes.has(code)) return true;

  if (status === 400) {
    return (
      Boolean(code && terminalCodes.has(code)) ||
      msg.includes("jwt") ||
      msg.includes("invalid refresh") ||
      msg.includes("refresh token") ||
      msg.includes("session")
    );
  }

  return false;
}
