import type {
  NotificationEventCategory,
  NotificationEventType,
} from "@/lib/notifications/core/notification-event-types";

export type NotificationProductCategory =
  | "transactional"
  | "social"
  | "marketing"
  | "system"
  | "call_history";

export type NotificationProductDomain =
  | "general_direct"
  | "group"
  | "trade"
  | "store_order"
  | "community"
  | "admin"
  | "call";

export type NotificationBellPolicy = "include" | "exclude" | "aggregate";
export type NotificationAppIconPolicy =
  | "exclude"
  | "domain_room_projection"
  | "orphan_event_projection";
export type NotificationForegroundPolicy =
  | "banner_and_sound"
  | "sound_only"
  | "silent"
  | "suppress_in_active_context"
  | "call_authority_only";
export type NotificationDeepLinkResolverKey =
  | "chat_room"
  | "group_room"
  | "trade_room"
  | "store_order_room"
  | "display_route"
  | "missed_call"
  | "notification_inbox"
  | "call_authority";
export type NotificationPreferenceKey =
  | "chat"
  | "trade"
  | "delivery"
  | "community"
  | "notice"
  | "marketing"
  | "system"
  | "call";
export type NotificationDedupeScope =
  | "room_message"
  | "room_message_recipient"
  | "domain_entity_recipient"
  | "campaign_recipient"
  | "call_recipient";

export type NotificationEventTypeDefinition = Readonly<{
  type: NotificationEventType;
  eventCategory: NotificationEventCategory;
  productCategory: NotificationProductCategory;
  domain: NotificationProductDomain;
  bellPolicy: NotificationBellPolicy;
  appIconPolicy: NotificationAppIconPolicy;
  foregroundPolicy: NotificationForegroundPolicy;
  soundEventKey: string | null;
  legacyAdminSoundKey: string;
  androidChannelKey: string | null;
  iosCategoryKey: string | null;
  deepLinkResolverKey: NotificationDeepLinkResolverKey;
  preferenceKey: NotificationPreferenceKey;
  ttlSeconds: number;
  dedupeScope: NotificationDedupeScope;
  allowRichImage: boolean;
}>;

function define(
  definition: NotificationEventTypeDefinition
): NotificationEventTypeDefinition {
  return Object.freeze(definition);
}

/**
 * Canonical notification type registry.
 *
 * Sound assets/resolution, native channel creation, and badge projection remain
 * in their existing authorities. This registry references those authorities and
 * is the single type-level policy manifest used by producers and dispatchers.
 */
export const NOTIFICATION_EVENT_DEFINITIONS = Object.freeze({
  chat_message: define({
    type: "chat_message",
    eventCategory: "chat_message",
    productCategory: "social",
    domain: "general_direct",
    bellPolicy: "aggregate",
    appIconPolicy: "domain_room_projection",
    foregroundPolicy: "suppress_in_active_context",
    soundEventKey: "messenger_direct_message_received",
    legacyAdminSoundKey: "message_default",
    androidChannelKey: "dibay_chat_messages_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "chat_room",
    preferenceKey: "chat",
    ttlSeconds: 86_400,
    dedupeScope: "room_message",
    allowRichImage: false,
  }),
  group_message: define({
    type: "group_message",
    eventCategory: "group_message",
    productCategory: "social",
    domain: "group",
    bellPolicy: "aggregate",
    appIconPolicy: "domain_room_projection",
    foregroundPolicy: "suppress_in_active_context",
    soundEventKey: "messenger_group_message_received",
    legacyAdminSoundKey: "group_message",
    androidChannelKey: "dibay_chat_messages_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "group_room",
    preferenceKey: "chat",
    ttlSeconds: 86_400,
    dedupeScope: "room_message",
    allowRichImage: false,
  }),
  mention_message: define({
    type: "mention_message",
    eventCategory: "group_message",
    productCategory: "social",
    domain: "group",
    bellPolicy: "include",
    appIconPolicy: "domain_room_projection",
    foregroundPolicy: "suppress_in_active_context",
    soundEventKey: "community_mention_received",
    legacyAdminSoundKey: "group_message",
    androidChannelKey: "dibay_community_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "group_room",
    preferenceKey: "chat",
    ttlSeconds: 86_400,
    dedupeScope: "room_message_recipient",
    allowRichImage: false,
  }),
  pin_message: define({
    type: "pin_message",
    eventCategory: "group_message",
    productCategory: "social",
    domain: "group",
    bellPolicy: "include",
    appIconPolicy: "domain_room_projection",
    foregroundPolicy: "suppress_in_active_context",
    soundEventKey: "messenger_group_message_received",
    legacyAdminSoundKey: "group_message",
    androidChannelKey: "dibay_chat_messages_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "group_room",
    preferenceKey: "chat",
    ttlSeconds: 86_400,
    dedupeScope: "room_message",
    allowRichImage: false,
  }),
  trade_message: define({
    type: "trade_message",
    eventCategory: "trade_message",
    productCategory: "transactional",
    domain: "trade",
    bellPolicy: "aggregate",
    appIconPolicy: "domain_room_projection",
    foregroundPolicy: "suppress_in_active_context",
    soundEventKey: "trade_chat_message_received",
    legacyAdminSoundKey: "trade_message",
    androidChannelKey: "dibay_trade_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "trade_room",
    preferenceKey: "trade",
    ttlSeconds: 86_400,
    dedupeScope: "room_message",
    allowRichImage: false,
  }),
  store_order_message: define({
    type: "store_order_message",
    eventCategory: "order_status",
    productCategory: "transactional",
    domain: "store_order",
    bellPolicy: "aggregate",
    appIconPolicy: "domain_room_projection",
    foregroundPolicy: "suppress_in_active_context",
    soundEventKey: "delivery_chat_message_received_user",
    legacyAdminSoundKey: "store_order",
    androidChannelKey: "dibay_delivery_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "store_order_room",
    preferenceKey: "delivery",
    ttlSeconds: 86_400,
    dedupeScope: "room_message",
    allowRichImage: false,
  }),
  trade_status: define({
    type: "trade_status",
    eventCategory: "trade_status",
    productCategory: "transactional",
    domain: "trade",
    bellPolicy: "include",
    appIconPolicy: "exclude",
    foregroundPolicy: "banner_and_sound",
    soundEventKey: "trade_offer_received",
    legacyAdminSoundKey: "trade_status",
    androidChannelKey: "dibay_trade_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "display_route",
    preferenceKey: "trade",
    ttlSeconds: 604_800,
    dedupeScope: "domain_entity_recipient",
    allowRichImage: false,
  }),
  order_status: define({
    type: "order_status",
    eventCategory: "order_status",
    productCategory: "transactional",
    domain: "store_order",
    bellPolicy: "include",
    appIconPolicy: "exclude",
    foregroundPolicy: "banner_and_sound",
    soundEventKey: "delivery_order_status_changed_user",
    legacyAdminSoundKey: "order_status",
    androidChannelKey: "dibay_orders_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "display_route",
    preferenceKey: "delivery",
    ttlSeconds: 604_800,
    dedupeScope: "domain_entity_recipient",
    allowRichImage: false,
  }),
  delivery_status: define({
    type: "delivery_status",
    eventCategory: "delivery_status",
    productCategory: "transactional",
    domain: "store_order",
    bellPolicy: "include",
    appIconPolicy: "exclude",
    foregroundPolicy: "banner_and_sound",
    soundEventKey: "delivery_order_status_changed_user",
    legacyAdminSoundKey: "delivery_status",
    androidChannelKey: "dibay_delivery_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "display_route",
    preferenceKey: "delivery",
    ttlSeconds: 604_800,
    dedupeScope: "domain_entity_recipient",
    allowRichImage: false,
  }),
  community_activity: define({
    type: "community_activity",
    eventCategory: "community_activity",
    productCategory: "social",
    domain: "community",
    bellPolicy: "include",
    appIconPolicy: "exclude",
    foregroundPolicy: "banner_and_sound",
    soundEventKey: "community_comment_received",
    legacyAdminSoundKey: "community_activity",
    androidChannelKey: "dibay_community_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "display_route",
    preferenceKey: "community",
    ttlSeconds: 604_800,
    dedupeScope: "domain_entity_recipient",
    allowRichImage: false,
  }),
  admin_marketing_banner: define({
    type: "admin_marketing_banner",
    eventCategory: "admin_marketing_banner",
    productCategory: "marketing",
    domain: "admin",
    bellPolicy: "exclude",
    appIconPolicy: "exclude",
    foregroundPolicy: "silent",
    soundEventKey: "admin_notice_received",
    legacyAdminSoundKey: "admin_marketing_banner",
    androidChannelKey: "dibay_admin_notice_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "display_route",
    preferenceKey: "marketing",
    ttlSeconds: 259_200,
    dedupeScope: "campaign_recipient",
    allowRichImage: true,
  }),
  admin_notice: define({
    type: "admin_notice",
    eventCategory: "admin_notice",
    productCategory: "system",
    domain: "admin",
    bellPolicy: "include",
    appIconPolicy: "exclude",
    foregroundPolicy: "banner_and_sound",
    soundEventKey: "admin_notice_received",
    legacyAdminSoundKey: "admin_notice",
    androidChannelKey: "dibay_admin_notice_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "display_route",
    preferenceKey: "notice",
    ttlSeconds: 604_800,
    dedupeScope: "campaign_recipient",
    allowRichImage: true,
  }),
  admin_test: define({
    type: "admin_test",
    eventCategory: "admin_notice",
    productCategory: "system",
    domain: "admin",
    bellPolicy: "exclude",
    appIconPolicy: "exclude",
    foregroundPolicy: "banner_and_sound",
    soundEventKey: "admin_notice_received",
    legacyAdminSoundKey: "admin_notice",
    androidChannelKey: "dibay_admin_notice_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "notification_inbox",
    preferenceKey: "system",
    ttlSeconds: 3_600,
    dedupeScope: "campaign_recipient",
    allowRichImage: true,
  }),
  missed_call: define({
    type: "missed_call",
    eventCategory: "missed_call",
    productCategory: "call_history",
    domain: "call",
    bellPolicy: "include",
    appIconPolicy: "orphan_event_projection",
    foregroundPolicy: "banner_and_sound",
    soundEventKey: "call_missed",
    legacyAdminSoundKey: "missed_call",
    androidChannelKey: "dibay_calls_missed_v1",
    iosCategoryKey: null,
    deepLinkResolverKey: "missed_call",
    preferenceKey: "call",
    ttlSeconds: 604_800,
    dedupeScope: "call_recipient",
    allowRichImage: false,
  }),
  incoming_call_signal: define({
    type: "incoming_call_signal",
    eventCategory: "incoming_call_signal",
    productCategory: "system",
    domain: "call",
    bellPolicy: "exclude",
    appIconPolicy: "exclude",
    foregroundPolicy: "call_authority_only",
    soundEventKey: null,
    legacyAdminSoundKey: "incoming_call_ringtone",
    androidChannelKey: null,
    iosCategoryKey: null,
    deepLinkResolverKey: "call_authority",
    preferenceKey: "call",
    ttlSeconds: 60,
    dedupeScope: "call_recipient",
    allowRichImage: false,
  }),
} satisfies Record<NotificationEventType, NotificationEventTypeDefinition>);

export function getNotificationEventDefinition(
  type: NotificationEventType
): NotificationEventTypeDefinition {
  return NOTIFICATION_EVENT_DEFINITIONS[type];
}

export function eventTypeForAdminCampaignType(
  campaignType: "notice" | "marketing" | "system"
): NotificationEventType {
  return campaignType === "marketing" ? "admin_marketing_banner" : "admin_notice";
}
