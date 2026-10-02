import type { SupabaseClient } from "@supabase/supabase-js";

/** Stable machine key — established-member cross-layer subject conflict (R7-3). */
export const PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED =
  "provider_account_reconciliation_required" as const;

/** Safe user-facing Korean copy — no PII / no account ownership disclosure. */
export const PROVIDER_ACCOUNT_RECONCILIATION_REQUIRED_MESSAGE =
  "이 로그인 계정은 기존 dibaY 계정과 연결 상태를 확인해야 합니다. 다른 로그인 방법을 사용하거나 고객지원에 문의해 주세요.";

/**
 * R7-3 — Auth principal with ANY `profiles` row is non-disposable for automatic
 * Web OAuth owner-rebind / landing-pad tombstone.
 *
 * This is NOT a login-eligibility predicate (deleted/sns_pending/blocked still count).
 */
export async function authUserHasProductProfile(
  sb: SupabaseClient,
  authUserId: string,
): Promise<boolean> {
  const userId = String(authUserId ?? "").trim();
  if (!userId) return false;
  const { data, error } = await sb.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (error) {
    // Fail closed for destructive rebind: treat lookup failure as "may have profile".
    return true;
  }
  return Boolean(data?.id);
}
