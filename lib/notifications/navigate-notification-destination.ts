/**
 * Notification row → canonical destination navigation (presentation only).
 * Does not change deeplink / badge / FCM authority.
 * Support case destinations use deliverSupportOpen (no hard-nav product path).
 */

import {
  resolveNotificationDestination,
  type ResolveNotificationDestinationInput,
} from "@/lib/notifications/resolve-notification-destination";
import { armNotificationDestinationEnterSession } from "@/lib/notifications/notification-destination-enter-session";
import { withNotificationEntryFrom } from "@/lib/notifications/notification-entry-from";
import { parseSupportCaseIdFromPushPath } from "@/lib/support/support-push-modal-entry";
import { deliverSupportOpen } from "@/lib/support/deliver-support-open";
import type { PromotionCoordinationChannel } from "@/lib/platform-promotion-lifecycle/content-visit-contract";

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

function recordPromotionOpenIfEventDestination(
  href: string,
  channel: PromotionCoordinationChannel
): void {
  if (typeof window === "undefined") return;
  void import("@/lib/platform-promotion-lifecycle/client-record-content-visit")
    .then((m) => {
      m.recordPromotionContentVisitClient({
        hrefOrEventId: href,
        sourceChannel: channel,
      });
    })
    .catch(() => undefined);
}

/**
 * Click contract:
 * resolve → immediate feedback → markRead (non-blocking) → navigate(destination)
 * Support case → deliverSupportOpen (no router.push).
 * Read failure must not change destination.
 *
 * promotionOpenChannel: BELL (inbox) or PUSH (OS notification open). DELIVERED/CREATED alone must not call this.
 */
export function activateNotificationDestination(input: {
  router: RouterLike;
  resolveInput: ResolveNotificationDestinationInput;
  onBeforeNavigate?: (href: string) => void;
  unreadIds?: readonly string[];
  markRead?: (ids: string[]) => void | Promise<void | boolean>;
  /** Default BELL — inbox open. Pass PUSH for OS push open. */
  promotionOpenChannel?: Extract<PromotionCoordinationChannel, "PUSH" | "BELL">;
}): string {
  const dest = resolveNotificationDestination(input.resolveInput);
  const stamped = withNotificationEntryFrom(dest.href);
  input.onBeforeNavigate?.(stamped);
  const ids = (input.unreadIds ?? []).map((id) => String(id).trim()).filter(Boolean);
  if (ids.length > 0 && input.markRead) {
    void Promise.resolve(input.markRead(ids)).then(() => undefined);
  }

  const supportCaseId = parseSupportCaseIdFromPushPath(dest.href);
  if (supportCaseId) {
    deliverSupportOpen({
      caseId: supportCaseId,
      notificationId: input.resolveInput.notificationId ?? null,
      source: "inbox",
    });
    return stamped;
  }

  recordPromotionOpenIfEventDestination(
    dest.href,
    input.promotionOpenChannel === "PUSH" ? "PUSH" : "BELL"
  );
  pushNotificationDestination(input.router, dest.href);
  return stamped;
}
