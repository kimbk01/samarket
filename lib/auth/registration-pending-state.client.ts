/**
 * 현재 회원의 빠진 가입 단계(전화·주소) — 화면 요청 단계 안내(`registration-guidance-fetch-gate`)가 보내기 전에 쓰는 사본.
 * 값은 서버 판정(`getOnboardingStatus.registrationNextStep`)이 담긴 응답에서만 채운다(클라이언트가 다시 계산하지 않는다):
 * `/api/me/mandatory-address-gate` · `/api/me/signup-status` · 서버 403 `signup_incomplete`+step.
 * 모르면 null → 서버가 판단(보내기 전에 막지 않는다). 오래된 값(10분)도 「모름」으로 본다.
 * 설계 `docs/audit/registration-action-cta-ssot-design-2026-11-21.md` §5-3.
 */
export type RegistrationPendingStep = "phone" | "address";

const STALE_MS = 10 * 60_000;

let state: { step: RegistrationPendingStep | null; at: number } | null = null;

/** 서버가 준 값으로 갱신 — `null` = 가입 완료(또는 동의 미완이라 이 장치 대상 아님) */
export function setRegistrationPendingFromServer(step: unknown): void {
  const s = step === "phone" || step === "address" ? step : null;
  state = { step: s, at: Date.now() };
}

/** 주소·전화가 바뀌었을 수 있음(주소 저장·전화 인증·로그아웃) — 다음 서버 응답까지 「모름」 */
export function invalidateRegistrationPending(): void {
  state = null;
}

/** 확실히 아는 빠진 단계 — 모르거나 오래됐으면 null */
export function peekKnownRegistrationPendingStep(nowMs = Date.now()): RegistrationPendingStep | null {
  if (!state) return null;
  if (nowMs - state.at > STALE_MS) return null;
  return state.step;
}

export function resetRegistrationPendingForTests(): void {
  state = null;
}
