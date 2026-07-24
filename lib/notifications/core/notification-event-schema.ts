import type {
  NotificationEventCategory,
  NotificationEventType,
} from "@/lib/notifications/core/notification-event-types";

export const PUSH_SUPPRESS_REASONS = [
  "blocked",
  "muted_room",
  "same_room_foreground",
  "sender_self",
  "user_settings",
] as const;

export type PushSuppressReason = (typeof PUSH_SUPPRESS_REASONS)[number];

export const SOUND_SUPPRESS_REASONS = [
  "muted_room",
  "same_room_foreground",
  "user_settings",
  "foreground_native_dup_guard",
] as const;

export type SoundSuppressReason = (typeof SOUND_SUPPRESS_REASONS)[number];

export type CreateNotificationEventInput = {
  userId: string;
  type: NotificationEventType;
  category: NotificationEventCategory;
  roomId?: string | null;
  callSessionId?: string | null;
  actorUserId?: string | null;
  messageId?: string | null;
  title: string;
  body: string;
  displayPayload?: Record<string, unknown> | null;
  dedupeKey: string;
  mutedSnapshot?: boolean;
  pushSuppressedReason?: PushSuppressReason | null;
  soundSuppressedReason?: SoundSuppressReason | null;
  deliveredAt?: string | null;
  unread?: boolean;
  /** Required by DB for message event types (notification_events_message_domain_required_check). */
  chatDomain?: string | null;
  domainIdentityKey?: string | null;
};

export type NotificationEventRow = {
  id: string;
  user_id: string;
  type: NotificationEventType;
  category: NotificationEventCategory;
  room_id: string | null;
  call_session_id: string | null;
  actor_user_id: string | null;
  message_id: string | null;
  title: string;
  body: string;
  display_payload: Record<string, unknown> | null;
  unread: boolean;
  read_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  muted_snapshot: boolean;
  push_suppressed_reason: string | null;
  sound_suppressed_reason: string | null;
  dedupe_key: string;
  created_at: string;
  chat_domain?: string | null;
  domain_identity_key?: string | null;
};
