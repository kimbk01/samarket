import { shouldClearProfileCacheOnGetUserFailure } from "@/lib/auth/supabase-get-user-cache-policy";

/** `/api/auth/session` 401 body code 등 — 확정적 세션 종료 여부 */
export function isTerminalAuthSessionCode(code: string | null | undefined): boolean {
  const c = String(code ?? "").trim();
  if (!c) return false;
  return shouldClearProfileCacheOnGetUserFailure(null, {
    code: c,
    message: c,
    status: 401,
  });
}

export function isTerminalAuthHttpStatus(status: number, code?: string | null): boolean {
  if (status === 401) {
    return isTerminalAuthSessionCode(code);
  }
  return false;
}
