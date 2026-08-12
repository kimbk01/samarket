/**
 * Gate 3 Step 4 — Member Notification A eligibility (shared by authority + list).
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

export type MemberNotificationAEventRow = Readonly<{
  id?: string | null;
  /** When present, must equal current memberId (load path normally scopes). */
  user_id?: string | null;
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

function payloadRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function metaKindFromMemberARow(row: MemberNotificationAEventRow): string {
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

export function storeIdFromMemberARow(row: MemberNotificationAEventRow): string | null {
  const payload = payloadRecord(row.display_payload);
  const legacyMeta = payloadRecord(payload?.legacyMeta);
  for (const c of [legacyMeta?.store_id, payload?.store_id, payload?.storeId]) {
    const s = typeof c === "string" ? c.trim() : "";
    if (s) return s;
  }
  return null;
}

/**
 * Persistent A gates (list + unread).
 * DELETE WITHOUT READ: unread=true + read_at=null + deleted_at/inbox_dismissed_at set
 * still fails here via isInboxDismissedNotificationEvent — Badge A / App Icon drop without READ.
 */
function passesPersistentAGates(row: MemberNotificationAEventRow): boolean {
  if (!isNotificationEventBadgeEligible(row)) return false;
  if (isInboxDismissedNotificationEvent(row as never)) return false;

  const type = String(row.type ?? "").trim();
  const category = String(row.category ?? "").trim();
  if (isChatMessageNotificationType(type)) return false;
  // Legacy inbox collapsed type ("chat") must not pass as A when event_type was omitted.
  if (type === "chat" || category === "chat") return false;
  if (type === "admin_test" || type === "incoming_call_signal" || type === "incoming_call") return false;

  // Gate 2 missed: room-bound → B only; orphan → A
  if (isRoomBoundMissedCallEvent(row)) return false;
  if (isOrphanMissedCallEvent(row)) return true;

  if (type === "missed_call" || category === "missed_call") return false;

  const attentionKey = resolveNotificationAttentionKey(row);
  if (isOwnerIntakeAttentionKey(attentionKey)) return false;

  const metaKind = metaKindFromMemberARow(row);
  if (metaKind && isOwnerStoreOperationMetaKind(metaKind)) return false;
  if (isOwnerStoreCommerceNotificationRow({ meta: { kind: metaKind } })) return false;

  const classified = classifyBadgeAuthority({
    type,
    category,
    kind: type || category,
    metaKind: metaKind || null,
    attentionKey,
    storeId: storeIdFromMemberARow(row),
    userId: "viewer",
  });

  return classified.classification === "A_MEMBER_NOTIFICATION";
}

/** Unread A-eligible (canonical digit / mark-all / unread list). */
export function isMemberNotificationAUnread(row: MemberNotificationAEventRow): boolean {
  if (row.unread === false) return false;
  if (row.read_at != null && String(row.read_at).trim() !== "") return false;
  return passesPersistentAGates(row);
}

/** List rows (read or unread) under same A type/recipient policy. */
export function isMemberNotificationAListItem(row: MemberNotificationAEventRow): boolean {
  return passesPersistentAGates(row);
}
