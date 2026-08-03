/**
 * Gate 3 — A-set snapshot helpers (digit / list / mark-all) from canonical authority.
 */
import { resolveMemberNotificationAuthorityFromRows } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-authority";
import type { MemberNotificationAEventRow } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";
import { resolveNotificationAttentionKey } from "@/lib/notifications/core/notification-attention-key";
import { isMemberNotificationAUnread } from "@/lib/notifications/badge-authority-rebuild/member-notification-a-eligibility";

export type AuthorityASetSnapshot = Readonly<{
  /** Legacy attention keys (ADAPTER) — not digit authority. */
  digitAttentionKeys: readonly string[];
  digitCount: number;
  digitEventIds: readonly string[];
  unreadListEventIds: readonly string[];
  markAllEventIds: readonly string[];
  authorityVersion: string;
}>;

export function snapshotAuthorityASets(
  rows: readonly MemberNotificationAEventRow[],
  memberId = "viewer"
): AuthorityASetSnapshot {
  const auth = resolveMemberNotificationAuthorityFromRows(rows, memberId);
  const attentionKeys: string[] = [];
  const keySeen = new Set<string>();
  for (const row of rows) {
    if (!isMemberNotificationAUnread(row)) continue;
    const key = resolveNotificationAttentionKey(row);
    if (key && !keySeen.has(key)) {
      keySeen.add(key);
      attentionKeys.push(key);
    }
  }
  return {
    digitAttentionKeys: attentionKeys,
    digitCount: auth.unreadCount,
    digitEventIds: auth.eventIds,
    unreadListEventIds: auth.eventIds,
    markAllEventIds: auth.eventIds,
    authorityVersion: auth.authorityVersion,
  };
}

export function sortedUnique(ids: readonly string[]): string[] {
  return [...new Set(ids.map((x) => x.trim()).filter(Boolean))].sort();
}

export function gate2ASetsEqual(snap: AuthorityASetSnapshot): boolean {
  const list = sortedUnique(snap.unreadListEventIds);
  const mark = sortedUnique(snap.markAllEventIds);
  const digit = sortedUnique(snap.digitEventIds);
  if (list.length !== mark.length || list.length !== digit.length) return false;
  for (let i = 0; i < list.length; i++) {
    if (list[i] !== mark[i] || list[i] !== digit[i]) return false;
  }
  return snap.digitCount === list.length;
}
