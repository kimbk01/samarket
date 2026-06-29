/**
 * DIBAY Notification Sound SSOT — static catalog (DB seed source of truth).
 */
import { NOTIFICATION_SOUND_ASSET_PATH } from "@/lib/notifications/play-notification-sound";
import type {
  NotificationSoundAssetRow,
  NotificationSoundEventRow,
  NotificationSoundDomain,
} from "@/lib/notifications/notification-sound-types";
import {
  DIBAY_DEFAULT_ASSET_ID,
  DEVICE_DEFAULT_NOTIFICATION_ASSET_ID,
  DEVICE_DEFAULT_RINGTONE_ASSET_ID,
  SILENT_ASSET_ID,
  SYSTEM_DEFAULT_EVENT_KEY,
} from "@/lib/notifications/notification-sound-types";

export const NOTIFICATION_SOUND_ASSETS: readonly NotificationSoundAssetRow[] = [
  {
    id: SILENT_ASSET_ID,
    label: "무음",
    kind: "silent",
    domain: "system",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: null,
    legacy_source: null,
    enabled: true,
  },
  {
    id: DIBAY_DEFAULT_ASSET_ID,
    label: "기본 일반 알림",
    kind: "dibay_default",
    domain: "system",
    file_path: NOTIFICATION_SOUND_ASSET_PATH,
    file_url: null,
    ios_sound_name: "default",
    android_channel_base: "dibay_chat_messages",
    legacy_source: { table: "static", key: "notification.wav" },
    enabled: true,
  },
  {
    id: "DIBAY-SND-010",
    label: "기본 메시지 수신",
    kind: "dibay_default",
    domain: "messenger_direct",
    file_path: NOTIFICATION_SOUND_ASSET_PATH,
    file_url: null,
    ios_sound_name: "default",
    android_channel_base: "dibay_chat_messages",
    legacy_source: null,
    enabled: true,
  },
  {
    id: "DIBAY-SND-011",
    label: "1:1 메시지 (legacy direct)",
    kind: "dibay_custom",
    domain: "messenger_direct",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_chat_messages",
    legacy_source: {
      table: "admin_notification_settings",
      key: "community_direct_chat",
      column: "sound_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-012",
    label: "그룹 메시지 (legacy group)",
    kind: "dibay_custom",
    domain: "messenger_group",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_chat_messages",
    legacy_source: {
      table: "admin_notification_settings",
      key: "community_group_chat",
      column: "sound_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-013",
    label: "거래 채팅 (legacy trade)",
    kind: "dibay_custom",
    domain: "trade",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_trade",
    legacy_source: {
      table: "admin_notification_settings",
      key: "trade_chat",
      column: "sound_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-020",
    label: "주문 알림 (legacy order)",
    kind: "dibay_custom",
    domain: "delivery_user",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_orders",
    legacy_source: { table: "admin_notification_settings", key: "order", column: "sound_url" },
    enabled: true,
  },
  {
    id: "DIBAY-SND-021",
    label: "매장/스토어 (legacy store)",
    kind: "dibay_custom",
    domain: "delivery_owner",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_delivery",
    legacy_source: { table: "admin_notification_settings", key: "store", column: "sound_url" },
    enabled: true,
  },
  {
    id: "DIBAY-SND-030",
    label: "오너 긴급 주문",
    kind: "dibay_custom",
    domain: "delivery_owner",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_delivery",
    legacy_source: {
      table: "admin_settings",
      key: "store_delivery_alert_sound",
      column: "value_json.url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-031",
    label: "주문 매칭 채팅",
    kind: "dibay_custom",
    domain: "delivery_user",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_orders",
    legacy_source: {
      table: "admin_settings",
      key: "order_match_chat_alert_sound",
      column: "value_json",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-040",
    label: "음성 수신 벨",
    kind: "dibay_custom",
    domain: "call_voice",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_calls_incoming",
    legacy_source: {
      table: "admin_messenger_call_sound_settings",
      key: "default",
      column: "voice_incoming_sound_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-041",
    label: "영상 수신 벨",
    kind: "dibay_custom",
    domain: "call_video",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_calls_incoming",
    legacy_source: {
      table: "admin_messenger_call_sound_settings",
      key: "default",
      column: "video_incoming_sound_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-042",
    label: "음성 발신 연결음",
    kind: "dibay_custom",
    domain: "call_voice",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: null,
    legacy_source: {
      table: "admin_messenger_call_sound_settings",
      key: "default",
      column: "voice_outgoing_ringback_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-043",
    label: "영상 발신 연결음",
    kind: "dibay_custom",
    domain: "call_video",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: null,
    legacy_source: {
      table: "admin_messenger_call_sound_settings",
      key: "default",
      column: "video_outgoing_ringback_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-044",
    label: "부재중 통화",
    kind: "dibay_custom",
    domain: "call_voice",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: "dibay_calls_missed",
    legacy_source: {
      table: "admin_messenger_call_sound_settings",
      key: "default",
      column: "missed_notification_sound_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-045",
    label: "통화 종료음",
    kind: "dibay_custom",
    domain: "call_voice",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: null,
    legacy_source: {
      table: "admin_messenger_call_sound_settings",
      key: "default",
      column: "call_end_sound_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-046",
    label: "통화 fallback",
    kind: "dibay_custom",
    domain: "call_voice",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: null,
    legacy_source: {
      table: "admin_messenger_call_sound_settings",
      key: "default",
      column: "default_fallback_sound_url",
    },
    enabled: true,
  },
  {
    id: "DIBAY-SND-050",
    label: "관리자 긴급",
    kind: "dibay_default",
    domain: "admin",
    file_path: NOTIFICATION_SOUND_ASSET_PATH,
    file_url: null,
    ios_sound_name: "default",
    android_channel_base: "dibay_admin_notice",
    legacy_source: null,
    enabled: true,
  },
  {
    id: DEVICE_DEFAULT_NOTIFICATION_ASSET_ID,
    label: "OS 기본 알림음",
    kind: "device_default",
    domain: "system",
    file_path: null,
    file_url: null,
    ios_sound_name: "default",
    android_channel_base: null,
    legacy_source: null,
    enabled: true,
  },
  {
    id: DEVICE_DEFAULT_RINGTONE_ASSET_ID,
    label: "OS 기본 벨소리",
    kind: "device_default",
    domain: "call_voice",
    file_path: null,
    file_url: null,
    ios_sound_name: null,
    android_channel_base: null,
    legacy_source: null,
    enabled: true,
  },
] as const;

type EventDef = Omit<NotificationSoundEventRow, "legacy_source"> & {
  legacy_source?: NotificationSoundEventRow["legacy_source"];
};

const ev = (
  event_key: string,
  label_ko: string,
  label_en: string,
  domain: NotificationSoundDomain,
  audience: NotificationSoundEventRow["audience"],
  direction: NotificationSoundEventRow["direction"],
  default_asset_id: string,
  android_channel_id: string,
  fallback_event_key: string | null = SYSTEM_DEFAULT_EVENT_KEY
): EventDef => ({
  event_key,
  label_ko,
  label_en,
  domain,
  audience,
  direction,
  default_asset_id,
  fallback_event_key,
  android_channel_id,
  ios_sound_name: null,
  vibration_enabled: true,
  priority: "default",
  can_room_mute: true,
  enabled: true,
});

export const NOTIFICATION_SOUND_EVENTS: readonly NotificationSoundEventRow[] = [
  {
    ...ev(
      SYSTEM_DEFAULT_EVENT_KEY,
      "시스템 기본",
      "System default",
      "system",
      "user",
      "system",
      DIBAY_DEFAULT_ASSET_ID,
      "dibay_chat_messages_v1",
      null
    ),
    fallback_event_key: null,
  },
  ev(
    "messenger_message_sent",
    "메시지 발신",
    "Message sent",
    "messenger_direct",
    "sender",
    "outbound",
    "DIBAY-SND-010",
    "dibay_chat_messages_v1",
    SYSTEM_DEFAULT_EVENT_KEY
  ),
  ev(
    "messenger_direct_message_received",
    "1:1 메시지 수신",
    "Direct message received",
    "messenger_direct",
    "receiver",
    "inbound",
    "DIBAY-SND-011",
    "dibay_chat_messages_v1"
  ),
  ev(
    "messenger_group_message_received",
    "그룹 메시지 수신",
    "Group message received",
    "messenger_group",
    "receiver",
    "inbound",
    "DIBAY-SND-012",
    "dibay_chat_messages_v1"
  ),
  ev(
    "friend_request_received",
    "친구 요청 수신",
    "Friend request received",
    "messenger_direct",
    "receiver",
    "inbound",
    "DIBAY-SND-011",
    "dibay_chat_messages_v1"
  ),
  ev(
    "friend_request_accepted",
    "친구 요청 승인",
    "Friend request accepted",
    "messenger_direct",
    "receiver",
    "inbound",
    "DIBAY-SND-011",
    "dibay_chat_messages_v1"
  ),
  ev(
    "trade_chat_message_received",
    "거래 채팅 수신",
    "Trade chat message",
    "trade",
    "receiver",
    "inbound",
    "DIBAY-SND-013",
    "dibay_trade_v1"
  ),
  ev(
    "trade_offer_received",
    "가격 제안",
    "Price offer",
    "trade",
    "receiver",
    "inbound",
    "DIBAY-SND-013",
    "dibay_trade_v1"
  ),
  ev(
    "trade_reserved",
    "거래 예약",
    "Trade reserved",
    "trade",
    "user",
    "inbound",
    "DIBAY-SND-013",
    "dibay_trade_v1"
  ),
  ev(
    "trade_completed",
    "거래 완료",
    "Trade completed",
    "trade",
    "user",
    "inbound",
    "DIBAY-SND-013",
    "dibay_trade_v1"
  ),
  ev(
    "delivery_order_status_changed_user",
    "주문 상태 변경",
    "Order status changed",
    "delivery_user",
    "user",
    "inbound",
    "DIBAY-SND-020",
    "dibay_orders_v1"
  ),
  ev(
    "delivery_chat_message_received_user",
    "주문 채팅 수신 (구매자)",
    "Order chat (buyer)",
    "delivery_user",
    "receiver",
    "inbound",
    "DIBAY-SND-021",
    "dibay_delivery_v1"
  ),
  ev(
    "delivery_order_created_owner",
    "오너 신규 주문",
    "Owner new order",
    "delivery_owner",
    "owner",
    "inbound",
    "DIBAY-SND-030",
    "dibay_delivery_v1"
  ),
  ev(
    "delivery_chat_message_received_owner",
    "오너 주문 채팅",
    "Owner order chat",
    "delivery_owner",
    "owner",
    "inbound",
    "DIBAY-SND-021",
    "dibay_delivery_v1"
  ),
  ev(
    "delivery_order_cancelled_owner",
    "오너 주문 취소",
    "Owner order cancelled",
    "delivery_owner",
    "owner",
    "inbound",
    "DIBAY-SND-030",
    "dibay_delivery_v1"
  ),
  ev(
    "delivery_order_delayed_owner",
    "오너 주문 지연",
    "Owner order delayed",
    "delivery_owner",
    "owner",
    "inbound",
    "DIBAY-SND-030",
    "dibay_delivery_v1"
  ),
  ev(
    "delivery_order_sold_out_owner",
    "오너 품절",
    "Owner sold out",
    "delivery_owner",
    "owner",
    "inbound",
    "DIBAY-SND-030",
    "dibay_delivery_v1"
  ),
  ev(
    "delivery_review_received_owner",
    "리뷰 알림",
    "Review notification",
    "delivery_owner",
    "owner",
    "inbound",
    "DIBAY-SND-021",
    "dibay_delivery_v1"
  ),
  ev(
    "delivery_inquiry_received_owner",
    "문의 알림",
    "Inquiry notification",
    "delivery_owner",
    "owner",
    "inbound",
    "DIBAY-SND-021",
    "dibay_delivery_v1"
  ),
  ev(
    "delivery_order_match_chat",
    "주문 매칭 채팅",
    "Order match chat",
    "delivery_user",
    "user",
    "inbound",
    "DIBAY-SND-031",
    "dibay_orders_v1"
  ),
  ev(
    "call_incoming_voice",
    "음성 통화 수신",
    "Voice call incoming",
    "call_voice",
    "receiver",
    "inbound",
    "DIBAY-SND-040",
    "dibay_calls_incoming_v7"
  ),
  ev(
    "call_incoming_video",
    "영상 통화 수신",
    "Video call incoming",
    "call_video",
    "receiver",
    "inbound",
    "DIBAY-SND-041",
    "dibay_calls_incoming_v7"
  ),
  ev(
    "call_outgoing_voice",
    "음성 발신 연결",
    "Voice outgoing ringback",
    "call_voice",
    "sender",
    "outbound",
    "DIBAY-SND-042",
    "dibay_calls_incoming_v7"
  ),
  ev(
    "call_outgoing_video",
    "영상 발신 연결",
    "Video outgoing ringback",
    "call_video",
    "sender",
    "outbound",
    "DIBAY-SND-043",
    "dibay_calls_incoming_v7"
  ),
  ev(
    "call_missed",
    "부재중 통화",
    "Missed call",
    "call_voice",
    "receiver",
    "inbound",
    "DIBAY-SND-044",
    "dibay_calls_missed_v1"
  ),
  ev(
    "call_ended",
    "통화 종료",
    "Call ended",
    "call_voice",
    "user",
    "system",
    "DIBAY-SND-045",
    "dibay_calls_incoming_v7"
  ),
  ev(
    "call_rejected",
    "통화 거절",
    "Call rejected",
    "call_voice",
    "receiver",
    "system",
    "DIBAY-SND-045",
    "dibay_calls_incoming_v7"
  ),
  ev(
    "admin_report_received",
    "관리자 신고",
    "Admin report",
    "admin",
    "admin",
    "inbound",
    "DIBAY-SND-050",
    "dibay_admin_notice_v1"
  ),
  ev(
    "admin_notice_received",
    "관리자 공지",
    "Admin notice",
    "admin",
    "user",
    "inbound",
    DIBAY_DEFAULT_ASSET_ID,
    "dibay_admin_notice_v1"
  ),
  ev(
    "settlement_balance_low",
    "잔액 부족",
    "Low balance",
    "settlement",
    "owner",
    "inbound",
    "DIBAY-SND-021",
    "dibay_delivery_v1"
  ),
  ev(
    "settlement_charge_approved",
    "충전 승인",
    "Charge approved",
    "settlement",
    "owner",
    "inbound",
    "DIBAY-SND-021",
    "dibay_delivery_v1"
  ),
  ev(
    "settlement_charge_rejected",
    "충전 반려",
    "Charge rejected",
    "settlement",
    "owner",
    "inbound",
    "DIBAY-SND-021",
    "dibay_delivery_v1"
  ),
  ev(
    "settlement_charge_requested",
    "충전 요청 (관리자)",
    "Charge request (admin)",
    "settlement",
    "admin",
    "inbound",
    "DIBAY-SND-050",
    "dibay_admin_notice_v1"
  ),
  ev(
    "community_comment_received",
    "댓글",
    "Comment",
    "community",
    "receiver",
    "inbound",
    "DIBAY-SND-010",
    "dibay_community_v1"
  ),
  ev(
    "community_mention_received",
    "멘션",
    "Mention",
    "community",
    "receiver",
    "inbound",
    "DIBAY-SND-010",
    "dibay_community_v1"
  ),
  ev(
    "community_like_received",
    "좋아요",
    "Like",
    "community",
    "receiver",
    "inbound",
    "DIBAY-SND-010",
    "dibay_community_v1"
  ),
].map((e) => ({ legacy_source: null, ...e }));

export const NOTIFICATION_SOUND_EVENT_KEYS = NOTIFICATION_SOUND_EVENTS.map((e) => e.event_key);

export const NOTIFICATION_SOUND_ASSET_IDS = NOTIFICATION_SOUND_ASSETS.map((a) => a.id);

export function getRegistryAsset(assetId: string): NotificationSoundAssetRow | undefined {
  return NOTIFICATION_SOUND_ASSETS.find((a) => a.id === assetId);
}

export function getRegistryEvent(eventKey: string): NotificationSoundEventRow | undefined {
  return NOTIFICATION_SOUND_EVENTS.find((e) => e.event_key === eventKey);
}

export function eventsByDomain(domain: NotificationSoundDomain): NotificationSoundEventRow[] {
  return NOTIFICATION_SOUND_EVENTS.filter((e) => e.domain === domain);
}

export function assertRegistryIntegrity(): void {
  const assetIds = new Set<string>();
  for (const a of NOTIFICATION_SOUND_ASSETS) {
    if (assetIds.has(a.id)) throw new Error(`duplicate asset id: ${a.id}`);
    assetIds.add(a.id);
  }
  const eventKeys = new Set(NOTIFICATION_SOUND_EVENTS.map((e) => e.event_key));
  if (eventKeys.size !== NOTIFICATION_SOUND_EVENTS.length) {
    throw new Error("duplicate event_key in registry");
  }
  for (const e of NOTIFICATION_SOUND_EVENTS) {
    if (!assetIds.has(e.default_asset_id)) {
      throw new Error(`event ${e.event_key} missing default_asset_id ${e.default_asset_id}`);
    }
    if (e.fallback_event_key && !eventKeys.has(e.fallback_event_key)) {
      throw new Error(`event ${e.event_key} invalid fallback ${e.fallback_event_key}`);
    }
    if (!e.android_channel_id?.trim()) {
      throw new Error(`event ${e.event_key} missing android_channel_id`);
    }
  }
}

assertRegistryIntegrity();
