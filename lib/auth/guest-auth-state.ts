"use client";

/**
 * 비로그인(guest) 확정 상태 — 401 1회 확인 후 refresh·profile fetch 중단.
 * sessionPhase(guest) 와 함께 쓰며, UI 계층은 이 모듈을 직접 참조하지 않는다.
 */

let authMissing = false;
let guestRecoverable = false;
let guestSource: string | null = null;
let guestEstablishedAt = 0;

function logGuest(tag: string, payload: Record<string, unknown>): void {
  if (typeof console === "undefined" || typeof console.info !== "function") return;
  console.info(
    tag,
    JSON.stringify({
      at: Date.now(),
      authMissing,
      guestRecoverable,
      guestSource,
      sessionState: authMissing ? "guest" : "loading",
      ...payload,
    }),
  );
}

/** 전역 authMissing — guest 확정 후 true */
export function isAuthMissing(): boolean {
  return authMissing;
}

/** guest 확정 여부 (authMissing 동의어) */
export function isGuestAuthEstablished(): boolean {
  return authMissing;
}

export function getGuestEstablishedAt(): number {
  return guestEstablishedAt;
}

/** API 401 수신 — guest 확정·측정 로그 */
export function noteGuest401(source: string, detail?: Record<string, unknown>): void {
  logGuest("[guest_401_detected]", { source, ...detail });
  establishGuestAuthState(source);
}

/** Boot race — session/profile evidence may still recover; fetch gate bypass until terminal guest. */
export function establishRecoverableGuestAuthState(source: string): void {
  if (authMissing && !guestRecoverable) return;
  authMissing = true;
  guestRecoverable = true;
  guestSource = source;
  if (guestEstablishedAt <= 0) guestEstablishedAt = Date.now();
  logGuest("[guest_state_established]", { source, recoverable: true });
}

export function isRecoverableGuestAuthEstablished(): boolean {
  return authMissing && guestRecoverable;
}

/** guest 세션 확정 (terminal) — refresh·인증 fetch 중단 */
export function establishGuestAuthState(source: string): void {
  if (authMissing && !guestRecoverable) return;
  authMissing = true;
  guestRecoverable = false;
  guestSource = source;
  guestEstablishedAt = Date.now();
  logGuest("[guest_state_established]", { source, recoverable: false });
}

/** guest 확정 후 스킵된 fetch — 브라우저 콘솔 측정용 */
export function logGuestFetchSkipped(fetch: string, source: string): void {
  logGuest("[guest_fetch_skipped]", { fetch, source });
}

/** 로그인·세션 복구 성공 시 guest 게이트 해제 */
export function clearGuestAuthState(): void {
  authMissing = false;
  guestRecoverable = false;
  guestSource = null;
  guestEstablishedAt = 0;
}

export function getGuestAuthSource(): string | null {
  return guestSource;
}

/** vitest reset */
export function resetGuestAuthStateForTests(): void {
  clearGuestAuthState();
}

/** dev·E2E — guest gate 상태 확인 */
export function exposeGuestAuthStateProbeForDev(): void {
  if (typeof window === "undefined" || process.env.NODE_ENV === "production") return;
  (
    window as Window & {
      __dibayGuestAuthProbe?: () => { authMissing: boolean; guestEstablishedAt: number };
    }
  ).__dibayGuestAuthProbe = () => ({
    authMissing: isAuthMissing(),
    guestRecoverable,
    guestSource,
    guestEstablishedAt: getGuestEstablishedAt(),
  });
}
