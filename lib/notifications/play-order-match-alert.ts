import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { invalidateNotificationSoundSsotCache } from "@/lib/notifications/notification-sound-resolver";

const ORDER_MATCH_CHAT_EVENT_KEY = "delivery_order_match_chat";

export function bustOrderMatchAlertSoundCache(): void {
  invalidateNotificationSoundSsotCache();
}

/** Order-match 채팅 알림 — SSOT resolver only */
export async function playOrderMatchChatAlert(): Promise<void> {
  if (typeof window === "undefined") return;
  await playEventNotificationSound(ORDER_MATCH_CHAT_EVENT_KEY);
}
