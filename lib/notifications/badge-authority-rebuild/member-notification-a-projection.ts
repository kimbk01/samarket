/**
 * Gate 3 Step 4 — Member Notification A projection.
 *
 * Bell digit SSOT = canonical A unread event-id count (NOT attention keys).
 * attentionKeys retained as ADAPTER for non-digit explain tooling only.
 */
import { resolveNotificationAttentionKey } from "@/lib/notifications/core/notification-attention-key";
import {
  isChatMessageNotificationType,
  isOrphanMissedCallEvent,
} from "@/lib/notifications/chat-notification-attention-projection";
import { isOwnerIntakeAttentionKey } from "@/lib/notifications/badge-authority-rebuild/phase1-authority-contract";
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import {
  isMemberNotificationAListItem,
  isMemberNotificationAUnread,
  type MemberNotificationAEventRow,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

export type { MemberNotificationAEventRow };
export { isMemberNotificationAListItem, isMemberNotificationAUnread };

export const MEMBER_NOTIFICATION_A_PROJECTION =
  "member_notification_a_projection_v1" as const;

export type MemberNotificationAProjection = Readonly<{
  authority: typeof MEMBER_NOTIFICATION_A_PROJECTION;
  /** Canonical A unread event count (= |eventIds|). */
  memberUnreadNotificationCount: number;
  /**
   * ADAPTER ONLY — not Bell digit authority.
   * Kept for explain / migration tooling.
   */
  attentionKeys: readonly string[];
  /** Canonical A unread event ids (digit / list unread / mark-all). */
  eventIds: readonly string[];
  excludedReasonByEventId: Readonly<Record<string, string>>;
  authorityVersion?: string;
  computedAt?: string;
  memberKey?: `user:${string}`;
}>;

export function buildMemberNotificationAProjection(
  rows: readonly MemberNotificationAEventRow[],
  memberId = "viewer"
): MemberNotificationAProjection {
  const canonical = resolveMemberNotificationAuthorityFromRows(rows, memberId);
  const idSet = new Set(canonical.eventIds);

  const attentionKeys: string[] = [];
  const keySeen = new Set<string>();
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
        else if (isOrphanMissedCallEvent(row))
          excludedReasonByEventId[id] = "missed_call_unexpected";
        else if (type === "missed_call") excludedReasonByEventId[id] = "missed_call_room";
        else if (isOwnerIntakeAttentionKey(resolveNotificationAttentionKey(row)))
          excludedReasonByEventId[id] = "owner_intake";
        else excludedReasonByEventId[id] = "not_a_member";
      }
      continue;
    }
    if (id && !idSet.has(id)) {
      excludedReasonByEventId[id] = "dedupe_collapsed";
      continue;
    }
    const key = resolveNotificationAttentionKey(row);
    if (key && !keySeen.has(key)) {
      keySeen.add(key);
      attentionKeys.push(key);
    }
  }

  return {
    authority: MEMBER_NOTIFICATION_A_PROJECTION,
    memberUnreadNotificationCount: canonical.unreadCount,
    attentionKeys,
    eventIds: canonical.eventIds,
    excludedReasonByEventId,
    authorityVersion: canonical.authorityVersion,
    computedAt: canonical.computedAt,
    memberKey: canonical.memberKey,
  };
}

export function deriveMemberUnreadNotificationCount(
  rows: readonly MemberNotificationAEventRow[],
  memberId = "viewer"
): number {
  return resolveMemberNotificationAuthorityFromRows(rows, memberId).unreadCount;
}

/**
 * Map inbox API row → A projection row shape.
 *
 * Inbox DTO collapses many event types to legacy `notification_type: "system"`
 * while keeping canonical meaning on `bell_presentation_type` (e.g. admin_notice).
 * Prefer bell/category when legacy type is the collapsed "system" bucket so
 * Bell digit N and list/filter A sets stay aligned.
 */
export function memberNotificationAEventFromInboxRow(row: {
  id?: string | null;
  type?: string | null;
  category?: string | null;
  notification_type?: string | null;
  /** Canonical notification_events.type from inbox DTO — prefer over collapsed legacy type. */
  event_type?: string | null;
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
  const eventType = String(row.event_type ?? "").trim();
  const legacyType =
    eventType ||
    String(row.type ?? "").trim() ||
    String(row.notification_type ?? "").trim();
  const bell = String(row.bell_presentation_type ?? "").trim();
  const categoryRaw = String(row.category ?? "").trim();
  const pushKind = String(row.push_kind ?? "").trim().toLowerCase();
  // Collapsed legacy notification_type=chat / push_kind=chat → treat as chat for A gates.
  const chatCollapsed =
    pushKind === "chat" || String(row.notification_type ?? "").trim().toLowerCase() === "chat";
  const type = chatCollapsed
    ? eventType || "chat"
    : (legacyType === "" || legacyType === "system") && bell
      ? bell
      : legacyType || bell || categoryRaw;
  const category =
    categoryRaw ||
    (bell && (legacyType === "" || legacyType === "system") ? bell : "") ||
    type;
  const unread =
    row.unread != null ? row.unread !== false : row.is_read === false;
  return {
    id: row.id,
    type,
    category,
    unread,
    read_at: row.read_at ?? null,
    room_id: row.room_id,
    dedupe_key: row.dedupe_key,
    display_payload: row.display_payload ?? { legacyMeta: row.meta ?? {} },
    meta: row.meta,
  };
}

/**
 * Bell list base filter: A type/recipient policy.
 * Unread rows must be in canonical A eventIds (digit ≡ unread list ≡ mark-all).
 * Read A rows kept for UI until Notification Center phase (not part of unread set).
 */
export function filterMemberNotificationAInboxRows<T extends Parameters<
  typeof memberNotificationAEventFromInboxRow
>[0]>(rows: readonly T[], memberId = "viewer"): T[] {
  const mapped = rows.map((r) => ({
    raw: r,
    row: memberNotificationAEventFromInboxRow(r),
  }));
  const authority = resolveMemberNotificationAuthorityFromRows(
    mapped.map((m) => m.row),
    memberId
  );
  const allowUnread = new Set(authority.eventIds);
  return mapped
    .filter(({ row }) => {
      if (!isMemberNotificationAListItem(row)) return false;
      const id = String(row.id ?? "").trim();
      const unread =
        row.unread !== false &&
        !(row.read_at != null && String(row.read_at).trim() !== "");
      if (unread) return Boolean(id) && allowUnread.has(id);
      return true;
    })
    .map((m) => m.raw);
}

/** Unread list rows whose ids are in canonical A set (same as digit / mark-all). */
export function filterMemberNotificationAUnreadAuthorityRows<T extends Parameters<
  typeof memberNotificationAEventFromInboxRow
>[0]>(
  rows: readonly T[],
  memberId = "viewer"
): T[] {
  const mapped = rows.map((r) => ({
    raw: r,
    row: memberNotificationAEventFromInboxRow(r),
  }));
  const authority = resolveMemberNotificationAuthorityFromRows(
    mapped.map((m) => m.row),
    memberId
  );
  const allow = new Set(authority.eventIds);
  return mapped.filter((m) => allow.has(String(m.row.id ?? "").trim())).map((m) => m.raw);
}
