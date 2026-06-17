"use client";

const LOGIN_REDIRECT_LOOP_KEY = "dibay:login_auto_redirect";
const LOGIN_REDIRECT_WINDOW_MS = 8_000;
const LOGIN_REDIRECT_MAX_COUNT = 2;

export function shouldBlockLoginAutoRedirect(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(LOGIN_REDIRECT_LOOP_KEY);
    const parsed = raw
      ? (JSON.parse(raw) as { count?: number; firstAt?: number })
      : null;
    if (!parsed?.firstAt || now - parsed.firstAt > LOGIN_REDIRECT_WINDOW_MS) {
      sessionStorage.setItem(
        LOGIN_REDIRECT_LOOP_KEY,
        JSON.stringify({ count: 1, firstAt: now }),
      );
      return false;
    }
    const nextCount = (parsed.count ?? 0) + 1;
    if (nextCount > LOGIN_REDIRECT_MAX_COUNT) {
      if (typeof console !== "undefined" && typeof console.info === "function") {
        console.info(
          "[auth-loop] login_redirect_loop_detected",
          JSON.stringify({ at: now, count: nextCount }),
        );
      }
      return true;
    }
    sessionStorage.setItem(
      LOGIN_REDIRECT_LOOP_KEY,
      JSON.stringify({ count: nextCount, firstAt: parsed.firstAt }),
    );
    return false;
  } catch {
    return false;
  }
}

export function clearLoginRedirectLoopGuard(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(LOGIN_REDIRECT_LOOP_KEY);
  } catch {
    /* ignore */
  }
}
