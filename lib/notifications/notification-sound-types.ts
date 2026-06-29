/**
 * DIBAY Notification Sound SSOT — types.
 * Admin: /admin/settings/notifications
 */

export const NOTIFICATION_SOUND_DOMAINS = [
  "system",
  "messenger_direct",
  "messenger_group",
  "trade",
  "delivery_user",
  "delivery_owner",
  "call_voice",
  "call_video",
  "admin",
  "settlement",
  "community",
] as const;

export type NotificationSoundDomain = (typeof NOTIFICATION_SOUND_DOMAINS)[number];

export const NOTIFICATION_SOUND_AUDIENCES = ["user", "owner", "admin", "sender", "receiver"] as const;

export type NotificationSoundAudience = (typeof NOTIFICATION_SOUND_AUDIENCES)[number];

export const NOTIFICATION_SOUND_DIRECTIONS = ["inbound", "outbound", "system"] as const;

export type NotificationSoundDirection = (typeof NOTIFICATION_SOUND_DIRECTIONS)[number];

export const SOUND_KINDS = ["silent", "dibay_default", "dibay_custom", "device_default"] as const;

export type SoundKind = (typeof SOUND_KINDS)[number];

export type LegacySourceRef = {
  table: string;
  key?: string;
  column?: string;
  url_at_seed?: string | null;
  checksum?: string | null;
  null_at_seed?: boolean;
};

export type NotificationSoundAssetRow = {
  id: string;
  label: string;
  kind: SoundKind;
  domain: NotificationSoundDomain | null;
  file_path: string | null;
  file_url: string | null;
  ios_sound_name: string | null;
  android_channel_base: string | null;
  legacy_source: LegacySourceRef | null;
  enabled: boolean;
};

export type NotificationSoundEventRow = {
  event_key: string;
  label_ko: string;
  label_en: string;
  domain: NotificationSoundDomain;
  audience: NotificationSoundAudience;
  direction: NotificationSoundDirection;
  default_asset_id: string;
  fallback_event_key: string | null;
  android_channel_id: string;
  ios_sound_name: string | null;
  vibration_enabled: boolean;
  priority: string;
  can_room_mute: boolean;
  enabled: boolean;
  legacy_source: LegacySourceRef | null;
};

export type NotificationSoundMappingRow = {
  event_key: string;
  asset_id: string;
  use_device_default: boolean;
  volume: number;
  repeat_count: number;
  cooldown_seconds: number;
  vibration_enabled: boolean | null;
  priority: string | null;
  enabled: boolean;
};

export type ResolvedFrom =
  | "room_mute"
  | "user_pref"
  | "admin_mapping"
  | "event_default"
  | "fallback_chain"
  | "dibay_default"
  | "device_default";

export type ResolvedNotificationSound = {
  eventKey: string;
  assetId: string;
  kind: SoundKind;
  webUrl: string | null;
  iosSoundName: string | null;
  androidChannelId: string;
  vibration: boolean;
  volume: number;
  repeatCount: number;
  cooldownSeconds: number;
  priority: string;
  enabled: boolean;
  resolvedFrom: ResolvedFrom;
  legacySource?: LegacySourceRef | null;
};

export type ResolveNotificationSoundContext = {
  roomId?: string | null;
  userId?: string | null;
  platform?: "web" | "android" | "ios";
  roomMuted?: boolean;
  userSoundEnabled?: boolean;
  userDomainEnabled?: boolean;
  devicePreferDefault?: boolean;
};

export const SYSTEM_DEFAULT_EVENT_KEY = "system_default" as const;
export const DIBAY_DEFAULT_ASSET_ID = "DIBAY-SND-001" as const;
export const SILENT_ASSET_ID = "DIBAY-SND-000" as const;
export const DEVICE_DEFAULT_NOTIFICATION_ASSET_ID = "DIBAY-SND-900" as const;
export const DEVICE_DEFAULT_RINGTONE_ASSET_ID = "DIBAY-SND-901" as const;
