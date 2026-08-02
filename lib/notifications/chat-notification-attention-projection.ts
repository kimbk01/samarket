/**
 * A/B Badge Projection SSOT (REBUILD — no Store Authority).
 *
 * memberBellTotal = A_member
 *   (system / trade / buyer order / notice — not chat, not missed, not store owner intake)
 *
 * memberAppIconTotal =
 *   A_member
 *   + |GD| + |Group| + |Trade| + |Customer SO|
 *   + orphan missed
 *
 * Owner SO rooms → existing Owner Row/Hub/FAB only (not member App Icon).
 * Store intake → Bell exclude (classify only); FAB/Bottom/Admin unchanged.
 *
 * DO NOT: Store Projection · RoomUnread rewrite · Adapter calc · heal · App Icon ±
 */
import {
  resolveNotificationAttentionKey,
  type NotificationAttentionKeyInput,
} from "@/lib/notifications/core/notification-attention-key";
import { isNotificationEventBadgeEligible } from "@/lib/notifications/core/notification-event-repository";
import { OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS } from "@/lib/notifications/owner-store-commerce-notification-meta";

export const CHAT_NOTIFICATION_ATTENTION_AUTHORITY =
  "chat_notification_attention_v1" as const;

/** Chat-message event types — Bell digit / A_member EXCLUDE. */
export const CHAT_MESSAGE_NOTIFICATION_TYPES = new Set([
  "chat_message",
  "group_message",
  "mention_message",
  "pin_message",
  "trade_message",
  "store_order_message",
]);

/** Never count toward Bell digit / A_member. */
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
  /** Owner SO — existing store surfaces; excluded from memberAppIconTotal. */
  ownerOrderRoomIds: readonly string[];
  /** All domains including owner (diagnostics / owner hub). */
  total: number;
  /** B_member_rooms count (no owner SO). */
  memberAppIconRoomCount: number;
}>;

export type NotificationAttentionProjection = Readonly<{
  /** A_member attention keys (Bell digit). */
  attentionKeys: readonly string[];
  eventIdsByAttentionKey: Readonly<Record<string, readonly string[]>>;
  byType: Readonly<Record<string, number>>;
  excludedChatMessageEventIds: readonly string[];
  excludedRoomBoundMissedCallEventIds: readonly string[];
  /** Orphan missed — B_member_missed; in memberAppIconTotal, not Bell. */
  excludedOrphanMissedCallEventIds: readonly string[];
  /** Store owner intake — Bell exclude classify only (not a Store Projection). */
  excludedStoreOwnerIntakeEventIds: readonly string[];
  /** A_member / Bell digit. */
  total: number;
  orphanMissedCallCount: number;
}>;

export type UnifiedAppIconProjection = Readonly<{
  authority: typeof CHAT_NOTIFICATION_ATTENTION_AUTHORITY;
  chat: ChatAttentionProjection;
  notification: NotificationAttentionProjection;
  /** memberAppIconTotal. */
  appIconTotal: number;
  memberNotificationTotal: number;
  missedCallCount: number;
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

function payloadRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * Classify-only: store owner intake must not enter Member Bell / memberAppIcon A axis.
 * Not a Store Badge Authority — existing FAB/Bottom/Admin paths stay as-is.
 */
function isStoreOwnerIntakeNotificationRow(row: NotificationAttentionKeyInput): boolean {
  const payload = payloadRecord(row.display_payload);
  const legacyMeta = payloadRecord(payload?.legacyMeta);
  const kind = String(legacyMeta?.kind ?? payload?.kind ?? "")
    .trim()
    .toLowerCase();
  if (kind && OWNER_STORE_COMMERCE_NOTIFICATION_META_KINDS.has(kind)) return true;
  if (kind.startsWith("store_point_")) return true;
  const dedupe = String(row.dedupe_key ?? "").trim();
  if (
    dedupe.includes(":owner:new_order:") ||
    dedupe.includes(":owner:accept_reminder:") ||
    dedupe.includes(":owner:buyer_cancel:") ||
    dedupe.includes(":owner:sold_out:") ||
    dedupe.includes(":owner:refund_req:") ||
    dedupe.includes(":owner:payment_ok:") ||
    dedupe.includes("store_point")
  ) {
    return true;
  }
  const key = resolveNotificationAttentionKey(row);
  return (
    key.startsWith("order_status:owner_intake:") || key.startsWith("order_status:owner_fee:")
  );
}

export function isChatMessageNotificationType(type: string | null | undefined): boolean {
  return CHAT_MESSAGE_NOTIFICATION_TYPES.has(String(type ?? "").trim());
}

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
  const memberAppIconRoomCount =
    generalRoomIds.length +
    groupRoomIds.length +
    tradeRoomIds.length +
    customerOrderRoomIds.length;
  return {
    generalRoomIds,
    groupRoomIds,
    tradeRoomIds,
    customerOrderRoomIds,
    ownerOrderRoomIds,
    total: memberAppIconRoomCount + ownerOrderRoomIds.length,
    memberAppIconRoomCount,
  };
}

/**
 * A_member attentions only.
 * Orphan missed + store owner intake excluded from Bell digit.
 */
export function buildNotificationAttentionProjection(
  rows: readonly NotificationAttentionEventRow[]
): NotificationAttentionProjection {
  const eventIdsByAttentionKey: Record<string, string[]> = {};
  const byType: Record<string, number> = {};
  const excludedChatMessageEventIds: string[] = [];
  const excludedRoomBoundMissedCallEventIds: string[] = [];
  const excludedOrphanMissedCallEventIds: string[] = [];
  const excludedStoreOwnerIntakeEventIds: string[] = [];
  const orphanMissedKeys = new Set<string>();
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

    if (isOrphanMissedCallEvent(row)) {
      if (id) excludedOrphanMissedCallEventIds.push(id);
      const missedKey = resolveNotificationAttentionKey(row);
      if (missedKey) orphanMissedKeys.add(missedKey);
      continue;
    }

    if (isStoreOwnerIntakeNotificationRow(row)) {
      if (id) excludedStoreOwnerIntakeEventIds.push(id);
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
    excludedOrphanMissedCallEventIds,
    excludedStoreOwnerIntakeEventIds,
    total: keyOrder.length,
    orphanMissedCallCount: orphanMissedKeys.size,
  };
}

export function buildUnifiedAppIconProjection(input: {
  chat: ChatAttentionProjectionInput;
  notificationEvents: readonly NotificationAttentionEventRow[];
}): UnifiedAppIconProjection {
  const chat = buildChatAttentionProjection(input.chat);
  const notification = buildNotificationAttentionProjection(input.notificationEvents);
  const missedCallCount = notification.orphanMissedCallCount;
  const memberNotificationTotal = notification.total;
  const appIconTotal =
    chat.memberAppIconRoomCount + memberNotificationTotal + missedCallCount;
  return {
    authority: CHAT_NOTIFICATION_ATTENTION_AUTHORITY,
    chat,
    notification,
    appIconTotal,
    memberNotificationTotal,
    missedCallCount,
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
  const memberRooms =
    projection.chat.generalRoomIds.length +
    projection.chat.groupRoomIds.length +
    projection.chat.tradeRoomIds.length +
    projection.chat.customerOrderRoomIds.length;
  if (projection.chat.memberAppIconRoomCount !== memberRooms) {
    errors.push("memberAppIconRoomCount!=member_rooms");
  }
  if (projection.notification.total !== projection.notification.attentionKeys.length) {
    errors.push("notification.total!=|attentionKeys|");
  }
  const expected =
    projection.chat.memberAppIconRoomCount +
    projection.memberNotificationTotal +
    projection.missedCallCount;
  if (projection.appIconTotal !== expected) {
    errors.push(
      `appIconTotal!=member_formula (${projection.appIconTotal}!=${expected})`
    );
  }
  if (projection.memberNotificationTotal !== projection.notification.total) {
    errors.push("memberNotificationTotal!=notification.total");
  }
  return { ok: errors.length === 0, errors };
}
