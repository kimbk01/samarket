"use client";

/**
 * Native SDK 로그인 진행 표식 — SDK 결과(성공·실패·취소)는 JS 메모리 콜백으로만 돌아온다.
 * 진행 중 앱 프로세스가 종료되면(샤오미 PeriodicCleaner 메모리 회수 실측) 결과가 사라지므로,
 * 다음 앱 시작 때 표식이 남아 있으면 「로그인이 중단됨」으로 판정한다 (타이머 아님 — 프로세스 재시작 신호).
 */
const STORAGE_KEY = "dibay:native-login-in-flight";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function markNativeLoginInFlight(provider: string): void {
  try {
    storage()?.setItem(STORAGE_KEY, provider);
  } catch {
    /* storage 불가 — 표식 없이 진행 */
  }
}

export function clearNativeLoginInFlight(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** 앱 시작 시 1회 — 이전 프로세스에서 끝나지 않은 Native 로그인이 있으면 provider 를 돌려주고 표식을 지운다. */
export function consumeInterruptedNativeLogin(): string | null {
  try {
    const s = storage();
    const provider = s?.getItem(STORAGE_KEY)?.trim() || null;
    if (provider) s?.removeItem(STORAGE_KEY);
    return provider;
  } catch {
    return null;
  }
}

export const NATIVE_LOGIN_INTERRUPTED_REASON = "login_interrupted";
