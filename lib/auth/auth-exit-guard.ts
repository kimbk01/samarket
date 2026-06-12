"use client";

let authExitNavigateStarted = false;

export function isAuthExitNavigateStarted(): boolean {
  return authExitNavigateStarted;
}

export function markAuthExitNavigateStarted(): void {
  authExitNavigateStarted = true;
}

export function resetAuthExitNavigateGuard(): void {
  authExitNavigateStarted = false;
}
