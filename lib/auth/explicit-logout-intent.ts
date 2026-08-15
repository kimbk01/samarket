"use client";

/**
 * Explicit logout / corrupt-clear intent — distinguishes product logout SIGNED_OUT
 * from unexpected Supabase SIGNED_OUT (must not become terminal_guest).
 *
 * Lifetime: begin → logout lifecycle → clear (always via finally).
 * TTL is a safety net only; must not remain active indefinitely.
 */

let explicitLogoutIntentUntil = 0;
let explicitLogoutIntentReason: string | null = null;
const EXPLICIT_LOGOUT_INTENT_MS = 30_000;

/** Call at the start of user logout or forceClearCorruptSession — before signOut. */
export function beginExplicitLogoutIntent(reason: string): void {
  explicitLogoutIntentReason = String(reason ?? "").trim() || "explicit_logout";
  explicitLogoutIntentUntil = Date.now() + EXPLICIT_LOGOUT_INTENT_MS;
}

export function isExplicitLogoutIntentActive(): boolean {
  if (explicitLogoutIntentUntil <= 0) return false;
  if (Date.now() >= explicitLogoutIntentUntil) {
    clearExplicitLogoutIntent();
    return false;
  }
  return true;
}

export function getExplicitLogoutIntentReason(): string | null {
  return isExplicitLogoutIntentActive() ? explicitLogoutIntentReason : null;
}

export function clearExplicitLogoutIntent(): void {
  explicitLogoutIntentUntil = 0;
  explicitLogoutIntentReason = null;
}

/** vitest */
export function resetExplicitLogoutIntentForTests(): void {
  clearExplicitLogoutIntent();
}
