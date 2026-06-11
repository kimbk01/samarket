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
