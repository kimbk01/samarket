/**
 * Notification row → canonical destination navigation (presentation only).
 * Does not change deeplink / badge / FCM authority.
 */

import {
  resolveNotificationDestination,
  type ResolveNotificationDestinationInput,
} from "@/lib/notifications/resolve-notification-destination";

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

/**
 * Click contract:
 * resolve → immediate feedback → markRead (non-blocking) → navigate(destination)
 * Read failure must not change destination.
 */
export function activateNotificationDestination(input: {
  router: RouterLike;
  resolveInput: ResolveNotificationDestinationInput;
  onBeforeNavigate?: (href: string) => void;
  unreadIds?: readonly string[];
  markRead?: (ids: string[]) => void | Promise<void | boolean>;
}): string {
  const dest = resolveNotificationDestination(input.resolveInput);
  input.onBeforeNavigate?.(dest.href);
  const ids = (input.unreadIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  if (ids.length > 0 && input.markRead) {
    void Promise.resolve(input.markRead(ids)).then(() => undefined);
  }
  pushNotificationDestination(input.router, dest.href);
  return dest.href;
}
