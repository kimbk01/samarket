/**
 * CUT 2 — Platform Popup app-session identity (SESSION suppression).
 * Survives route changes; resets on new browser/app session (sessionStorage).
 */

const SESSION_KEY = "dibay.platform_popup.app_session_id";

export function getOrCreatePlatformPopupAppSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY)?.trim();
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `pps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    return `pps-mem-${Date.now().toString(36)}`;
  }
}

export function readPlatformPopupAppSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/** Tests only. */
export function resetPlatformPopupAppSessionIdForTests(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
