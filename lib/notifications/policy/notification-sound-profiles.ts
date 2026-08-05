import type { NotificationEventCategory } from "@/lib/notifications/core/notification-event-types";
import { eventKeyForNotificationEventType } from "@/lib/notifications/notification-sound-event-map";
import type { NotificationEventType } from "@/lib/notifications/core/notification-event-types";
import { resolveNotificationSoundForEvent } from "@/lib/notifications/notification-sound-resolver";

export type NotificationSoundProfile = {
  id: string;
  category: NotificationEventCategory;
  name: string;
  soundUrl: string | null;
  androidChannelId: string;
  iosSoundName: string | null;
  enabled: boolean;
  version: number;
  eventKey: string;
  soundAssetId: string;
};

const CATEGORY_TO_EVENT_TYPE: Partial<Record<NotificationEventCategory, NotificationEventType>> = {
  chat_message: "chat_message",
  group_message: "group_message",
  trade_message: "trade_message",
  trade_status: "trade_status",
  order_status: "order_status",
  delivery_status: "delivery_status",
  community_activity: "community_activity",
  admin_marketing_banner: "admin_marketing_banner",
  admin_notice: "admin_notice",
  notice_published: "notice_published",
  inquiry_answered: "inquiry_answered",
  inbox_message_received: "inbox_message_received",
  missed_call: "missed_call",
  incoming_call_signal: "incoming_call_signal",
  chat: "chat_message",
  group: "group_message",
  trade: "trade_message",
  store: "store_order_message",
  call: "incoming_call_signal",
};

function eventKeyForCategory(category: NotificationEventCategory): string {
  const type = CATEGORY_TO_EVENT_TYPE[category];
  if (type) return eventKeyForNotificationEventType(type);
  return "system_default";
}

/** @deprecated Use resolveNotificationSoundForEvent — kept for push/profile adapter compatibility */
export function resolveNotificationSoundProfile(
  category: NotificationEventCategory
): NotificationSoundProfile {
  const eventKey = eventKeyForCategory(category);
  const resolved = resolveNotificationSoundForEvent(eventKey, { platform: "android" });

  const legacyDisabled =
    category === "incoming_call_signal" || category === "call";

  return {
    id: `ssot:${eventKey}`,
    category,
    name: eventKey,
    soundUrl: resolved.webUrl,
    androidChannelId: resolved.androidChannelId,
    iosSoundName: resolved.iosSoundName,
    enabled: !legacyDisabled && resolved.enabled,
    version: 1,
    eventKey,
    soundAssetId: resolved.assetId,
  };
}

export function resolveNotificationSoundProfileForEventType(type: NotificationEventType): NotificationSoundProfile {
  const eventKey = eventKeyForNotificationEventType(type);
  const resolved = resolveNotificationSoundForEvent(eventKey, { platform: "android" });
  return {
    id: `ssot:${eventKey}`,
    category: type as NotificationEventCategory,
    name: eventKey,
    soundUrl: resolved.webUrl,
    androidChannelId: resolved.androidChannelId,
    iosSoundName: resolved.iosSoundName,
    enabled: resolved.enabled,
    version: 1,
    eventKey,
    soundAssetId: resolved.assetId,
  };
}
