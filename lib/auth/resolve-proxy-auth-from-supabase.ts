import type { SupabaseClient } from "@supabase/supabase-js";

export type ProxyAuthResolveResult = {
  userId: string | null;
  /** true — 네트워크/일시 오류로 user 미확정 (HTML fail-open) */
  transientError: boolean;
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
      return { userId: sub, transientError: false };
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
      return { userId: user.id, transientError: false };
    }
    if (!error) {
      return { userId: null, transientError: false };
    }
    return { userId: null, transientError: true };
  } catch {
    return { userId: null, transientError: true };
  }
}
