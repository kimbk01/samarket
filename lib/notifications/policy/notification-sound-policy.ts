import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { adminSoundKeyForEventType } from "@/lib/notifications/core/notification-policy";
import type { NotificationDomain } from "@/lib/notifications/notification-domains";

const TYPE_TO_DOMAIN: Partial<Record<NotificationEventType, NotificationDomain>> = {
  chat_message: "community_direct_chat",
  group_message: "community_group_chat",
  trade_message: "trade_chat",
  store_order_message: "order",
};

export function notificationDomainForEventType(type: NotificationEventType): NotificationDomain | undefined {
  return TYPE_TO_DOMAIN[type];
}

export function adminSoundKeyForType(type: NotificationEventType): string {
  return adminSoundKeyForEventType(type);
}

export function shouldAllowNativeNotificationSound(appVisible: boolean): boolean {
  return !appVisible;
}
