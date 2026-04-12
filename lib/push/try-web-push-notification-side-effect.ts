import type { NotificationSideEffectPayloadOut } from "@/lib/notifications/publish-notification-side-effect";
import { sendWebPushNotificationsForUser } from "@/lib/push/send-web-push-for-user";

export async function trySendWebPushForNotification(out: NotificationSideEffectPayloadOut): Promise<void> {
  await sendWebPushNotificationsForUser(out);
}
