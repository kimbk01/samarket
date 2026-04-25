/** 레거시 테스트 로그인 제거 후에도 기존 인증 변경 이벤트 구독부 호환을 유지한다. */

/** 테스트 로그인 변경 시 마이페이지 등에서 `getCurrentUser()` 재동기화용 */
export const TEST_AUTH_CHANGED_EVENT = "kasama-test-auth-changed";

export function dispatchTestAuthChanged(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(TEST_AUTH_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export function getTestAuth(): { userId: string; username: string; role: string } | null {
  return null;
}

export function setTestAuth(userId: string, username: string, role: string): void {
  void userId;
  void username;
  void role;
  dispatchTestAuthChanged();
}

export function clearTestAuth(): void {
  dispatchTestAuthChanged();
}
