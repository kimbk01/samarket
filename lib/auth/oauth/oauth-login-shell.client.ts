"use client";

/**
 * OAuth handoff — AuthModal 을 닫지 않고 in-app provider panel 을 사용한다.
 */
export function handoffOAuthLoginShell(): void {
  /* no-op: login shell stays open under OAuth provider panel */
}

/** OAuth 실패 시 — AuthModal 이 이미 열려 있으므로 reopen 불필요 */
export function restoreOAuthLoginShellAfterFailure(): void {
  /* no-op */
}
