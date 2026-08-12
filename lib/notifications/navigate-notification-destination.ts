/**
 * Notification row → canonical destination navigation (presentation only).
 * Does not change deeplink / badge / FCM authority.
 */

const ATTR = "data-notif-dest-enter";
export const NOTIFICATION_DESTINATION_ENTER_MS = 440;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Arm bottom→top 440ms enter on the next route paint. */
export function armNotificationDestinationEnter(): void {
  if (typeof document === "undefined") return;
  if (prefersReducedMotion()) return;
  document.documentElement.setAttribute(ATTR, "1");
  window.setTimeout(() => {
    document.documentElement.removeAttribute(ATTR);
  }, NOTIFICATION_DESTINATION_ENTER_MS + 80);
}

type RouterLike = { push: (href: string) => void };

/** Resolve-first: never divert destination because read mutation failed. */
export function pushNotificationDestination(router: RouterLike, href: string): void {
  const target = String(href ?? "").trim();
  if (!target) return;
  armNotificationDestinationEnter();
  router.push(target);
}
