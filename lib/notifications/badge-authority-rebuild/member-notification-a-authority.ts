/**
 * Gate 3 Step 4 — Canonical Member Notification Authority (A).
 *
 * notification_events → resolveMemberNotificationAuthoritySet
 *   ├── Bell digit
 *   ├── Bell unread list ids
 *   └── mark-all target ids
 *
 * Attention keys are NOT A authority.
 */
import { memberBadgeIdentity } from "@/lib/notifications/badge-authority-rebuild/badge-authority-identity";
import {
  isMemberNotificationAUnread,
  type MemberNotificationAEventRow,
} from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

export const MEMBER_NOTIFICATION_A_AUTHORITY =
  "member_notification_a_authority_v1" as const;

export type MemberNotificationAAuthority = Readonly<{
  authority: typeof MEMBER_NOTIFICATION_A_AUTHORITY;
  memberKey: `user:${string}`;
  eventIds: readonly string[];
  unreadCount: number;
  authorityVersion: string;
  computedAt: string;
}>;

function dedupeKeyForRow(row: MemberNotificationAEventRow): string {
  const dedupe = String(row.dedupe_key ?? "").trim();
  if (dedupe) return `d:${dedupe}`;
  const id = String(row.id ?? "").trim();
  return id ? `i:${id}` : "";
}

/**
 * Pure canonical A set. Rows must already be scoped to member (user_id = memberId).
 * Duplicate dedupe_key → one event id (first wins; prefer newest-first load order).
 */
export function resolveMemberNotificationAuthorityFromRows(
  rows: readonly MemberNotificationAEventRow[],
  memberId: string
): MemberNotificationAAuthority {
  const computedAt = new Date().toISOString();
  const member = memberBadgeIdentity(memberId);
  const memberKey: `user:${string}` =
    member.ok && member.identity.scope === "member"
      ? member.identity.key
      : `user:${String(memberId ?? "").trim()}`;

  const chosen = new Map<string, string>();
  const eventIds: string[] = [];

  const memberIdNorm = String(memberId ?? "").trim();

  for (const row of rows) {
    const rowUser = String(row.user_id ?? "").trim();
    if (rowUser && memberIdNorm && rowUser !== memberIdNorm) continue;
    if (!isMemberNotificationAUnread(row)) continue;
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const dk = dedupeKeyForRow(row);
    if (!dk) continue;
    if (chosen.has(dk)) continue;
    chosen.set(dk, id);
    eventIds.push(id);
  }

  const unreadCount = eventIds.length;
  const authorityVersion = `${computedAt}#a${unreadCount}#${eventIds[0] ?? ""}#${
    eventIds[eventIds.length - 1] ?? ""
  }`;

  return {
    authority: MEMBER_NOTIFICATION_A_AUTHORITY,
    memberKey,
    eventIds,
    unreadCount,
    authorityVersion,
    computedAt,
  };
}

export function resolveMemberNotificationAuthoritySet(
  memberId: string,
  rows: readonly MemberNotificationAEventRow[]
): MemberNotificationAAuthority {
  return resolveMemberNotificationAuthorityFromRows(rows, memberId);
}
