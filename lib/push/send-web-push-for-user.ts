import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";

/**
 * @deprecated Prefer dispatchPushForUser — thin wrapper for existing call sites.
 */
export async function sendWebPushNotificationsForUser(out: NotificationSideEffectPayloadOut): Promise<void> {
  await dispatchPushForUser(out);
}
