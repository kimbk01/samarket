import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";

export async function trySendPushForNotification(out: NotificationSideEffectPayloadOut): Promise<void> {
  await dispatchPushForUser(out);
}

/** @deprecated Use dispatchPushForUser — kept for call-specific modules */
export async function trySendWebPushForNotification(out: NotificationSideEffectPayloadOut): Promise<void> {
  await dispatchPushForUser(out);
}
