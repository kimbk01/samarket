/** 클라이언트 세션 동안 가입 게이트 재검사 억제 */

let signupCompleteResolvedThisSession = false;
let consentResolvedThisSession = false;

export function markSignupConsentResolvedSession(): void {
  consentResolvedThisSession = true;
}

export function markSignupCompleteResolvedSession(): void {
  signupCompleteResolvedThisSession = true;
  consentResolvedThisSession = true;
}

/**
 * 가입(전화·주소) 완료 표시만 지운다 — 전화·주소가 바뀌었을 수 있을 때(재감사 2026-11-24 R5).
 * 동의 표시는 그대로(동의는 버전 변경 때 `resetSignupGateSessionFlags`).
 */
export function clearSignupCompleteResolvedSession(): void {
  signupCompleteResolvedThisSession = false;
}

export function resetSignupGateSessionFlags(): void {
  signupCompleteResolvedThisSession = false;
  consentResolvedThisSession = false;
}

export function isSignupCompleteResolvedThisSession(): boolean {
  return signupCompleteResolvedThisSession;
}

export function isConsentResolvedThisSession(): boolean {
  return consentResolvedThisSession;
}
