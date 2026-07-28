/**
 * First-unread entry boundary (Telegram-style).
 * Enter anchors to the first unread after lastRead — never to lastRead itself.
 */

export type FirstUnreadMessageRow = {
  id?: string;
  isMine?: boolean;
  pending?: boolean;
  messageType?: string | null;
};

function isUnreadCandidate(row: FirstUnreadMessageRow): boolean {
  if (row.pending) return false;
  if (row.messageType === "system" || row.messageType === "call_stub") return false;
  if (row.isMine) return false;
  return Boolean(row.id?.trim());
}

/**
 * @returns first unread message id after lastRead, or null if unresolved
 */
export function resolveFirstUnreadMessageId(input: {
  messages: readonly FirstUnreadMessageRow[];
  lastReadMessageId: string | null | undefined;
}): string | null {
  const lastRead = typeof input.lastReadMessageId === "string" ? input.lastReadMessageId.trim() : "";
  if (!lastRead || input.messages.length === 0) return null;

  const idx = input.messages.findIndex((m) => m.id === lastRead);
  if (idx < 0) return null;

  for (let i = idx + 1; i < input.messages.length; i += 1) {
    const row = input.messages[i]!;
    if (isUnreadCandidate(row)) return String(row.id).trim();
  }
  return null;
}

/**
 * Count unread candidates strictly after `afterMessageId` (viewport last visible).
 * If afterMessageId is null/missing, count all unread after lastRead.
 */
export function countUnreadMessagesBelow(input: {
  messages: readonly FirstUnreadMessageRow[];
  lastReadMessageId: string | null | undefined;
  afterMessageId: string | null | undefined;
}): number {
  const lastRead = typeof input.lastReadMessageId === "string" ? input.lastReadMessageId.trim() : "";
  const after = typeof input.afterMessageId === "string" ? input.afterMessageId.trim() : "";
  const msgs = input.messages;
  if (msgs.length === 0) return 0;

  let start = 0;
  if (after) {
    const afterIdx = msgs.findIndex((m) => m.id === after);
    start = afterIdx >= 0 ? afterIdx + 1 : 0;
  } else if (lastRead) {
    const lrIdx = msgs.findIndex((m) => m.id === lastRead);
    start = lrIdx >= 0 ? lrIdx + 1 : 0;
  }

  let n = 0;
  for (let i = start; i < msgs.length; i += 1) {
    if (isUnreadCandidate(msgs[i]!)) n += 1;
  }
  return n;
}

export function formatUnreadBadgeCount(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}

/**
 * FAB visibility:
 * - at latest + no unread below → hide
 * - away from latest, no unread below → arrow only
 * - unread below → arrow + badge
 */
export function resolveJumpToLatestFabState(input: {
  atLatest: boolean;
  unreadBelow: number;
}): { visible: boolean; badgeCount: number } {
  const unreadBelow = Math.max(0, Math.floor(Number(input.unreadBelow) || 0));
  if (input.atLatest && unreadBelow <= 0) {
    return { visible: false, badgeCount: 0 };
  }
  return { visible: true, badgeCount: unreadBelow };
}
