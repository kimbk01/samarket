"use client";

let profileEnsureInFlight: Promise<Response> | null = null;

/**
 * 같은 탭에서 SupabaseAuthSync·mypage 복구가 동시에 `/api/auth/profile/ensure`를
 * 호출해도 네트워크 왕복은 하나로 합친다.
 */
export function fetchProfileEnsureDeduped(): Promise<Response> {
  if (!profileEnsureInFlight) {
    profileEnsureInFlight = fetch("/api/auth/profile/ensure", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    }).finally(() => {
      profileEnsureInFlight = null;
    });
  }
  return profileEnsureInFlight;
}
