/**
 * Phase B — Chat Attention / Notification Attention / Unified App Icon Formula SSOT.
 *
 * Product (LOCKED 2026-08-01):
 *   ChatAttentionTotal = |unread room IDs| across GD+Group+Trade+Customer+Owner
 *   NotificationAttentionTotal = |distinct active non-chat attention_key|
 *   AppIconTotal = Chat + Notification
 *   BellBadge = NotificationAttentionTotal
 *
 * DO NOT: RoomUnread rewrite · Adapter calc · heal · raw event SUM · chat_message in Bell digit
 */
import {
  resolveNotificationAttentionKey,
  type NotificationAttentionKeyInput,
} from "@/lib/notifications/core/notification-attention-key";
import { isNotificationEventBadgeEligible } from "@/lib/notifications/core/notification-event-repository";

export const CHAT_NOTIFICATION_ATTENTION_AUTHORITY =
  "chat_notification_attention_v1" as const;

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
  "admin_marketing_banner",
  "admin_test",
  "incoming_call_signal",
  "incoming_call",
]);

export type ChatAttentionProjection = Readonly<{
  generalRoomIds: readonly string[];
  groupRoomIds: readonly string[];
  tradeRoomIds: readonly string[];
  customerOrderRoomIds: readonly string[];
  ownerOrderRoomIds: readonly string[];
  total: number;
}>;

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

export type UnifiedAppIconProjection = Readonly<{
  authority: typeof CHAT_NOTIFICATION_ATTENTION_AUTHORITY;
  chat: ChatAttentionProjection;
  notification: NotificationAttentionProjection;
  appIconTotal: number;
}>;

export type ChatAttentionProjectionInput = Readonly<{
  generalRoomIds: readonly string[];
  groupRoomIds: readonly string[];
  tradeRoomIds: readonly string[];
  customerOrderRoomIds: readonly string[];
  ownerOrderRoomIds: readonly string[];
}>;

export type NotificationAttentionEventRow = NotificationAttentionKeyInput &
  Readonly<{
    id?: string | null;
    unread?: boolean | null;
    read_at?: string | null;
    muted_snapshot?: boolean | null;
    display_payload?: unknown;
  }>;

function uniqIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

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

export function buildChatAttentionProjection(
  input: ChatAttentionProjectionInput
): ChatAttentionProjection {
  const generalRoomIds = uniqIds(input.generalRoomIds);
  const groupRoomIds = uniqIds(input.groupRoomIds);
  const tradeRoomIds = uniqIds(input.tradeRoomIds);
  const customerOrderRoomIds = uniqIds(input.customerOrderRoomIds);
  const ownerOrderRoomIds = uniqIds(input.ownerOrderRoomIds);
  return {
    generalRoomIds,
    groupRoomIds,
    tradeRoomIds,
    customerOrderRoomIds,
    ownerOrderRoomIds,
    total:
      generalRoomIds.length +
      groupRoomIds.length +
      tradeRoomIds.length +
      customerOrderRoomIds.length +
      ownerOrderRoomIds.length,
  };
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

export function buildUnifiedAppIconProjection(input: {
  chat: ChatAttentionProjectionInput;
  notificationEvents: readonly NotificationAttentionEventRow[];
}): UnifiedAppIconProjection {
  const chat = buildChatAttentionProjection(input.chat);
  const notification = buildNotificationAttentionProjection(input.notificationEvents);
  return {
    authority: CHAT_NOTIFICATION_ATTENTION_AUTHORITY,
    chat,
    notification,
    appIconTotal: chat.total + notification.total,
  };
}

export function assertUnifiedAppIconProjection(
  projection: UnifiedAppIconProjection
): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const chatSum =
    projection.chat.generalRoomIds.length +
    projection.chat.groupRoomIds.length +
    projection.chat.tradeRoomIds.length +
    projection.chat.customerOrderRoomIds.length +
    projection.chat.ownerOrderRoomIds.length;
  if (projection.chat.total !== chatSum) {
    errors.push(`chat.total!=sum_rooms (${projection.chat.total}!=${chatSum})`);
  }
  if (projection.notification.total !== projection.notification.attentionKeys.length) {
    errors.push("notification.total!=|attentionKeys|");
  }
  if (projection.appIconTotal !== projection.chat.total + projection.notification.total) {
    errors.push(
      `appIconTotal!=chat+notification (${projection.appIconTotal}!=${projection.chat.total}+${projection.notification.total})`
    );
  }
  return { ok: errors.length === 0, errors };
}
