import type { NotificationEventCategory } from "@/lib/notifications/core/notification-event-types";

export type NotificationSoundProfile = {
  id: string;
  category: NotificationEventCategory;
  name: string;
  soundUrl: string | null;
  androidChannelId: string;
  iosSoundName: string | null;
  enabled: boolean;
  version: number;
};

const CHANNEL_BY_CATEGORY: Record<NotificationEventCategory, string> = {
  chat_message: "dibay_chat_messages",
  group_message: "dibay_chat_messages",
  trade_message: "dibay_trade",
  trade_status: "dibay_trade",
  order_status: "dibay_orders",
  delivery_status: "dibay_delivery",
  community_activity: "dibay_community",
  admin_marketing_banner: "dibay_marketing",
  admin_notice: "dibay_admin_notice",
  missed_call: "dibay_calls_missed",
  incoming_call_signal: "dibay_calls_incoming",
  // legacy
  chat: "dibay_chat_messages",
  group: "dibay_chat_messages",
  trade: "dibay_trade",
  store: "dibay_orders",
  call: "dibay_calls_incoming",
};

export function resolveNotificationSoundProfile(
  category: NotificationEventCategory
): NotificationSoundProfile {
  const channel = CHANNEL_BY_CATEGORY[category] ?? "dibay_chat_messages";
  return {
    id: `default:${category}`,
    category,
    name: `default:${category}`,
    soundUrl: null,
    androidChannelId: channel,
    iosSoundName: null,
    enabled: category !== "incoming_call_signal" && category !== "call",
    version: 1,
  };
}
