/**
 * Notification row → canonical destination navigation (presentation only).
 * Does not change deeplink / badge / FCM authority.
 */

import {
  resolveNotificationDestination,
  type ResolveNotificationDestinationInput,
} from "@/lib/notifications/resolve-notification-destination";
import { armNotificationDestinationEnterSession } from "@/lib/notifications/notification-destination-enter-session";
import { withNotificationEntryFrom } from "@/lib/notifications/notification-entry-from";

type RouterLike = { push: (href: string) => void };

/**
 * Resolve-first navigate.
 * - Stamps `from=notifications` so destination Back returns to Notification Center.
 * - Enter motion: path-matched session → `AppRouteTransition` bottom→top 440ms.
 */
export function pushNotificationDestination(router: RouterLike, href: string): void {
  const raw = String(href ?? "").trim();
  if (!raw) return;
  const target = withNotificationEntryFrom(raw);
  armNotificationDestinationEnterSession(target);
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
  const stamped = withNotificationEntryFrom(dest.href);
  input.onBeforeNavigate?.(stamped);
  const ids = (input.unreadIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  if (ids.length > 0 && input.markRead) {
    void Promise.resolve(input.markRead(ids)).then(() => undefined);
  }
  pushNotificationDestination(input.router, dest.href);
  return stamped;
}
