/**
 * Notification Attention diagnostics.
 *
 * Product (LOCKED 2026-08-01):
 *   NotificationAttentionTotal = |distinct active non-chat attention_key|
 *
 * DO NOT: RoomUnread rewrite · Adapter calc · heal · raw event SUM · chat_message in Bell digit
 */
import {
  resolveNotificationAttentionKey,
  type NotificationAttentionKeyInput,
} from "@/lib/notifications/core/notification-attention-key";
import { isNotificationEventBadgeEligible } from "@/lib/notifications/core/notification-event-repository";

/** Chat-message event types — Bell digit / NotificationAttention EXCLUDE. */
export const CHAT_MESSAGE_NOTIFICATION_TYPES = new Set([
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
]);

/** Never count toward Bell digit / NotificationAttention. */
const DIGIT_EXCLUDED_TYPES = new Set([
  "admin_test",
  "incoming_call_signal",
  "incoming_call",
]);

export type NotificationAttentionProjection = Readonly<{
  attentionKeys: readonly string[];
  eventIdsByAttentionKey: Readonly<Record<string, readonly string[]>>;
  byType: Readonly<Record<string, number>>;
  /** Event ids that are unread chat_message-family (history/quarantine — not in total). */
  excludedChatMessageEventIds: readonly string[];
  /** Room-bound missed_call event ids (row/timeline only — not in total). */
  excludedRoomBoundMissedCallEventIds: readonly string[];
  total: number;
}>;

export type NotificationAttentionEventRow = NotificationAttentionKeyInput &
  Readonly<{
    id?: string | null;
    unread?: boolean | null;
    read_at?: string | null;
    muted_snapshot?: boolean | null;
    display_payload?: unknown;
  }>;

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

export function isChatMessageNotificationType(type: string | null | undefined): boolean {
  return CHAT_MESSAGE_NOTIFICATION_TYPES.has(String(type ?? "").trim());
}

/**
 * Orphan missed_call = no room_id (NotificationAttention).
 * Room-bound = has room_id (list row only — App Icon via room path if unread).
 */
export function isOrphanMissedCallEvent(row: {
  type?: string | null;
  category?: string | null;
  room_id?: string | null;
}): boolean {
  const type = String(row.type ?? "").trim();
  const category = String(row.category ?? "").trim();
  if (type !== "missed_call" && category !== "missed_call") return false;
  const roomId = String(row.room_id ?? "").trim();
  return !roomId;
}

export function isRoomBoundMissedCallEvent(row: {
  type?: string | null;
  category?: string | null;
  room_id?: string | null;
}): boolean {
  const type = String(row.type ?? "").trim();
  const category = String(row.category ?? "").trim();
  if (type !== "missed_call" && category !== "missed_call") return false;
  return Boolean(String(row.room_id ?? "").trim());
}

/**
 * Distinct active non-chat attention_key set from unread eligible events.
 * Compresses multiple rows sharing one key → count 1.
 */
export function buildNotificationAttentionProjection(
  rows: readonly NotificationAttentionEventRow[]
): NotificationAttentionProjection {
  const eventIdsByAttentionKey: Record<string, string[]> = {};
  const byType: Record<string, number> = {};
  const excludedChatMessageEventIds: string[] = [];
  const excludedRoomBoundMissedCallEventIds: string[] = [];
  const keyOrder: string[] = [];
  const keySeen = new Set<string>();

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (row.unread === false) continue;
    if (row.read_at != null && String(row.read_at).trim() !== "") continue;
    if (!isNotificationEventBadgeEligible(row)) continue;

    const type = String(row.type ?? "").trim();
    if (DIGIT_EXCLUDED_TYPES.has(type)) continue;

    if (isChatMessageNotificationType(type)) {
      if (id) excludedChatMessageEventIds.push(id);
      continue;
    }

    if (isRoomBoundMissedCallEvent(row)) {
      if (id) excludedRoomBoundMissedCallEventIds.push(id);
      continue;
    }

    const key = resolveNotificationAttentionKey(row);
    if (!key) continue;

    if (!eventIdsByAttentionKey[key]) {
      eventIdsByAttentionKey[key] = [];
    }
    if (id) eventIdsByAttentionKey[key].push(id);

    if (!keySeen.has(key)) {
      keySeen.add(key);
      keyOrder.push(key);
      const typeBucket = type || "unknown";
      byType[typeBucket] = nonNeg(byType[typeBucket]) + 1;
    }
  }

  return {
    attentionKeys: keyOrder,
    eventIdsByAttentionKey,
    byType,
    excludedChatMessageEventIds,
    excludedRoomBoundMissedCallEventIds,
    total: keyOrder.length,
  };
}

