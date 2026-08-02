/**
 * Slice 2-2 — Member Notification A projection (pure).
 *
 * Bell digit SSOT = memberUnreadNotificationCount from A-eligible events.
 * DO NOT feed App Icon ChatAttention / Phase B NotificationAttentionTotal from this module.
 * DO NOT mutate writers.
 */
import { isNotificationEventBadgeEligible } from "@/lib/notifications/core/notification-event-repository";
import { resolveNotificationAttentionKey } from "@/lib/notifications/core/notification-attention-key";
import { isInboxDismissedNotificationEvent } from "@/lib/notifications/inbox-events-merge";
import { classifyBadgeAuthority } from "@/lib/notifications/badge-authority-rebuild/badge-event-classifier";
import {
  isChatMessageNotificationType,
  isOrphanMissedCallEvent,
  isRoomBoundMissedCallEvent,
} from "@/lib/notifications/chat-notification-attention-projection";
import {
  isOwnerIntakeAttentionKey,
  isOwnerStoreOperationMetaKind,
} from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";
import { isOwnerStoreCommerceNotificationRow } from "@/lib/notifications/owner-store-commerce-notification-meta";

export const MEMBER_NOTIFICATION_A_PROJECTION =
  "member_notification_a_projection_v1" as const;

export type MemberNotificationAEventRow = Readonly<{
  id?: string | null;
  type?: string | null;
  category?: string | null;
  unread?: boolean | null;
  read_at?: string | null;
  room_id?: string | null;
  dedupe_key?: string | null;
  muted_snapshot?: boolean | null;
  display_payload?: unknown;
  meta?: unknown;
}>;

export type MemberNotificationAProjection = Readonly<{
  authority: typeof MEMBER_NOTIFICATION_A_PROJECTION;
  /** Distinct A attention keys (Bell digit). */
  memberUnreadNotificationCount: number;
  attentionKeys: readonly string[];
  eventIds: readonly string[];
  excludedReasonByEventId: Readonly<Record<string, string>>;
}>;

function payloadRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function metaKindFromRow(row: MemberNotificationAEventRow): string {
  const payload = payloadRecord(row.display_payload);
  const legacyMeta = payloadRecord(payload?.legacyMeta);
  const top = row.meta && typeof row.meta === "object" ? (row.meta as { kind?: unknown }).kind : null;
  const k =
    (typeof top === "string" && top) ||
    (typeof legacyMeta?.kind === "string" && legacyMeta.kind) ||
    (typeof payload?.kind === "string" && payload.kind) ||
    "";
  return String(k).trim();
}

function storeIdFromRow(row: MemberNotificationAEventRow): string | null {
  const payload = payloadRecord(row.display_payload);
  const legacyMeta = payloadRecord(payload?.legacyMeta);
  const candidates = [
    legacyMeta?.store_id,
    payload?.store_id,
    payload?.storeId,
  ];
  for (const c of candidates) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s) return s;
  }
  return null;
}

/**
 * True when this unread event counts toward Member Bell (A only).
 */
export function isMemberNotificationAUnread(row: MemberNotificationAEventRow): boolean {
  if (row.unread === false) return false;
  if (row.read_at != null && String(row.read_at).trim() !== "") return false;
  if (!isNotificationEventBadgeEligible(row)) return false;
  if (isInboxDismissedNotificationEvent(row as never)) return false;

  const type = String(row.type ?? "").trim();
  const category = String(row.category ?? "").trim();
  if (isChatMessageNotificationType(type)) return false;
  if (type === "missed_call" || category === "missed_call") return false;
  if (isOrphanMissedCallEvent(row) || isRoomBoundMissedCallEvent(row)) return false;
  if (type === "admin_marketing_banner" || type === "admin_test") return false;
  if (category === "admin_marketing_banner") return false;

  const attentionKey = resolveNotificationAttentionKey(row);
  if (isOwnerIntakeAttentionKey(attentionKey)) return false;

  const metaKind = metaKindFromRow(row);
  if (metaKind && isOwnerStoreOperationMetaKind(metaKind)) return false;
  if (isOwnerStoreCommerceNotificationRow({ meta: { kind: metaKind } })) return false;

  const classified = classifyBadgeAuthority({
    type,
    category,
    kind: type || category,
    metaKind: metaKind || null,
    attentionKey,
    storeId: storeIdFromRow(row),
    userId: "viewer",
  });

  return classified.classification === "A_MEMBER_NOTIFICATION";
}

export function buildMemberNotificationAProjection(
  rows: readonly MemberNotificationAEventRow[]
): MemberNotificationAProjection {
  const attentionKeys: string[] = [];
  const keySeen = new Set<string>();
  const eventIds: string[] = [];
  const excludedReasonByEventId: Record<string, string> = {};

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (row.unread === false) {
      if (id) excludedReasonByEventId[id] = "read";
      continue;
    }
    if (row.read_at != null && String(row.read_at).trim() !== "") {
      if (id) excludedReasonByEventId[id] = "read_at";
      continue;
    }
    if (!isMemberNotificationAUnread(row)) {
      if (id) {
        const type = String(row.type ?? "").trim();
        if (isChatMessageNotificationType(type)) excludedReasonByEventId[id] = "chat";
        else if (type === "missed_call" || isOrphanMissedCallEvent(row))
          excludedReasonByEventId[id] = "missed_call";
        else if (isOwnerIntakeAttentionKey(resolveNotificationAttentionKey(row)))
          excludedReasonByEventId[id] = "owner_intake";
        else if (type === "admin_marketing_banner")
          excludedReasonByEventId[id] = "marketing_ephemeral";
        else excludedReasonByEventId[id] = "not_a_member";
      }
      continue;
    }

    const key = resolveNotificationAttentionKey(row);
    if (!key) {
      if (id) excludedReasonByEventId[id] = "no_attention_key";
      continue;
    }
    if (id) eventIds.push(id);
    if (!keySeen.has(key)) {
      keySeen.add(key);
      attentionKeys.push(key);
    }
  }

  return {
    authority: MEMBER_NOTIFICATION_A_PROJECTION,
    memberUnreadNotificationCount: attentionKeys.length,
    attentionKeys,
    eventIds,
    excludedReasonByEventId,
  };
}

export function deriveMemberUnreadNotificationCount(
  rows: readonly MemberNotificationAEventRow[]
): number {
  return buildMemberNotificationAProjection(rows).memberUnreadNotificationCount;
}

/**
 * Inbox list predicate — A_member persistent rows (read or unread).
 * Excludes chat / missed / owner_intake / marketing / unknown.
 */
export function isMemberNotificationAListItem(row: MemberNotificationAEventRow): boolean {
  if (isInboxDismissedNotificationEvent(row as never)) return false;

  const type = String(row.type ?? "").trim();
  const category = String(row.category ?? "").trim();
  if (isChatMessageNotificationType(type)) return false;
  if (type === "missed_call" || category === "missed_call") return false;
  if (isOrphanMissedCallEvent(row) || isRoomBoundMissedCallEvent(row)) return false;
  if (type === "admin_marketing_banner" || type === "admin_test") return false;
  if (category === "admin_marketing_banner") return false;

  const attentionKey = resolveNotificationAttentionKey(row);
  if (isOwnerIntakeAttentionKey(attentionKey)) return false;

  const metaKind = metaKindFromRow(row);
  if (metaKind && isOwnerStoreOperationMetaKind(metaKind)) return false;
  if (isOwnerStoreCommerceNotificationRow({ meta: { kind: metaKind } })) return false;

  const classified = classifyBadgeAuthority({
    type,
    category,
    kind: type || category,
    metaKind: metaKind || null,
    attentionKey,
    storeId: storeIdFromRow(row),
    userId: "viewer",
  });

  return classified.classification === "A_MEMBER_NOTIFICATION";
}

/** Map inbox API row → A projection row shape. */
export function memberNotificationAEventFromInboxRow(row: {
  id?: string | null;
  type?: string | null;
  category?: string | null;
  notification_type?: string | null;
  bell_presentation_type?: string | null;
  is_read?: boolean | null;
  unread?: boolean | null;
  read_at?: string | null;
  room_id?: string | null;
  dedupe_key?: string | null;
  meta?: unknown;
  display_payload?: unknown;
  push_kind?: string | null;
}): MemberNotificationAEventRow {
  const type =
    String(row.type ?? "").trim() ||
    String(row.notification_type ?? "").trim() ||
    String(row.bell_presentation_type ?? "").trim();
  const unread =
    row.unread != null ? row.unread !== false : row.is_read === false;
  return {
    id: row.id,
    type,
    category: String(row.category ?? "").trim() || type,
    unread,
    read_at: row.read_at ?? null,
    room_id: row.room_id,
    dedupe_key: row.dedupe_key,
    display_payload: row.display_payload ?? { legacyMeta: row.meta ?? {} },
    meta: row.meta,
  };
}

export function filterMemberNotificationAInboxRows<T extends Parameters<
  typeof memberNotificationAEventFromInboxRow
>[0]>(rows: readonly T[]): T[] {
  return rows.filter((row) =>
    isMemberNotificationAListItem(memberNotificationAEventFromInboxRow(row))
  );
}
