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

/**
 * 비밀번호 로그인 직후 전용 — dedupe 에 붙지 않는다.
 * 진행 중이던 `fetchProfileEnsureDeduped`(예: 이전 401 응답 Promise)에 합류하면
 * 로그인 성공 직후에도 실패한 결과만 보게 되는 레이스를 막는다.
 */
export function fetchProfileEnsureAfterPasswordLogin(): Promise<Response> {
  return fetch("/api/auth/profile/ensure", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
}
