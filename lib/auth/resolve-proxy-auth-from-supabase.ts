import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldClearProfileCacheOnGetUserFailure } from "@/lib/auth/supabase-get-user-cache-policy";

export type ProxyAuthResolveResult = {
  userId: string | null;
  /** true — 네트워크/일시 오류로 user 미확정 (HTML fail-open) */
  transientError: boolean;
  /** true — 세션 만료·토큰 무효 등 확정적 인증 종료 */
  terminalAuthFailure: boolean;
};

/**
 * HTML proxy 게이트 — Route Handler 와 동일: `getClaims()` 로컬 JWT 우선, HS 등만 `getUser()`.
 */
export async function resolveProxyAuthFromSupabase(
  supabase: SupabaseClient
): Promise<ProxyAuthResolveResult> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub =
      data?.claims && typeof data.claims === "object" && data.claims !== null && "sub" in data.claims
        ? String((data.claims as { sub?: unknown }).sub ?? "").trim()
        : "";
    if (!error && sub) {
      return { userId: sub, transientError: false, terminalAuthFailure: false };
    }
  } catch {
    /* getClaims 실패 → getUser */
  }

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (user?.id) {
      return { userId: user.id, transientError: false, terminalAuthFailure: false };
    }
    if (!error) {
      return { userId: null, transientError: false, terminalAuthFailure: false };
    }
    const terminal = shouldClearProfileCacheOnGetUserFailure(user, error);
    return {
      userId: null,
      transientError: !terminal,
      terminalAuthFailure: terminal,
    };
  } catch {
    return { userId: null, transientError: true, terminalAuthFailure: false };
  }
}
