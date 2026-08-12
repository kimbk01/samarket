/**
 * Notification destination bottom→top enter — same arm/consume contract as
 * `lib/navigation/main-shell-push-session.ts` (path-matched, TTL).
 * Presentation only. Does not change route authority or badge writers.
 */

import { pathFromHref } from "@/lib/navigation/main-shell-push-session";
import { NOTIFICATION_DESTINATION_ENTER_MS } from "@/lib/notifications/notification-destination-enter-constants";

export type NotificationDestinationEnterSession = {
  toPath: string;
  at: number;
};

const STORAGE_KEY = "sam.notifDestEnter.v1";
const MAX_AGE_MS = 4000;

/** Applied on `[data-main-shell-push-surface]` at destination paint. */
export const NOTIF_DEST_ENTER_UP_CLASS = "notif-dest-enter-up";

let memorySession: NotificationDestinationEnterSession | null = null;

function normalizePath(path: string | null | undefined): string {
  return (path ?? "").split("?")[0]?.trim().replace(/\/+$/, "") || "/";
}

function pathMatches(current: string, expected: string): boolean {
  if (current === expected) return true;
  return current.startsWith(`${expected}/`);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Arm before `router.push` — consume only after destination pathname matches. */
export function armNotificationDestinationEnterSession(toHref: string): void {
  if (typeof window === "undefined") return;
  if (prefersReducedMotion()) return;
  const toPath = pathFromHref(toHref);
  if (!toPath || toPath === "/") return;
  const payload: NotificationDestinationEnterSession = {
    toPath,
    at: Date.now(),
  };
  memorySession = payload;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* private mode — memory session still works in SPA */
  }
}

/**
 * Destination layout: return session when pathname matches armed toPath.
 * Mismatch keeps pending (same as main-shell push axis intent). Expired clears.
 */
export function consumeNotificationDestinationEnterSession(
  pathname: string | null | undefined
): NotificationDestinationEnterSession | null {
  if (typeof window === "undefined") return null;
  const current = normalizePath(pathname);

  let parsed: NotificationDestinationEnterSession | null = memorySession;
  if (!parsed) {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        parsed = JSON.parse(raw) as NotificationDestinationEnterSession;
      }
    } catch {
      parsed = null;
    }
  }

  if (!parsed?.toPath) {
    memorySession = null;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }

  if (Date.now() - parsed.at > MAX_AGE_MS) {
    memorySession = null;
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }

  if (!pathMatches(current, normalizePath(parsed.toPath))) {
    return null;
  }

  memorySession = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return parsed;
}

/** Apply bottom→top 440ms on the live push surface (AppRouteTransition host). */
export function applyNotificationDestinationEnterOnSurface(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  el.classList.remove(NOTIF_DEST_ENTER_UP_CLASS);
  void el.offsetWidth;
  el.classList.add(NOTIF_DEST_ENTER_UP_CLASS);
  const cleanup = () => {
    el.classList.remove(NOTIF_DEST_ENTER_UP_CLASS);
  };
  const onEnd = (e: AnimationEvent) => {
    if (e.target !== el) return;
    el.removeEventListener("animationend", onEnd);
    cleanup();
  };
  el.addEventListener("animationend", onEnd);
  window.setTimeout(cleanup, NOTIFICATION_DESTINATION_ENTER_MS + 80);
}

export { NOTIFICATION_DESTINATION_ENTER_MS };
