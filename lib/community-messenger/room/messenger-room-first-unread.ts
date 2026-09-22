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
  if (row.messageType === "system") return false;
  if (row.isMine) return false;
  return Boolean(row.id?.trim());
}

/**
 * Single FAB / unread read-floor rule:
 * among known representations of the **viewer** last-read cursor, pick the
 * farthest id already present in the loaded timeline (by message index).
 *
 * Same authority (viewer participant last_read) — never invent a peer
 * `readReceipt` floor, never tip-floor by unread count.
 * Cursors missing from the loaded window are ignored (not used to widen).
 */
export function resolveFabReadFloorMessageId(input: {
  messages: readonly FirstUnreadMessageRow[];
  cursors: readonly (string | null | undefined)[];
}): string | null {
  const msgs = input.messages;
  if (msgs.length === 0) return null;
  let bestIdx = -1;
  let bestId: string | null = null;
  for (const raw of input.cursors) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id) continue;
    const idx = msgs.findIndex((m) => m.id === id);
    if (idx < 0) continue;
    if (idx > bestIdx) {
      bestIdx = idx;
      bestId = id;
    }
  }
  return bestId;
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
 * Count unread candidates for FAB badge — strictly after canonical read floor,
 * optionally narrowed further by viewport (`afterMessageId` = last visible).
 *
 * CUT-4 invariant: already-canonical-read history must never become badge count
 * merely because the viewport moved upward.
 *
 * - `lastReadMessageId` is the resolved viewer read floor (see
 *   `resolveFabReadFloorMessageId`). Historical rows at/before that floor are
 *   never countable.
 * - `afterMessageId` only narrows (max with lastRead); it must not widen past lastRead.
 * - When lastRead is missing entirely, return 0 — do not fall back to
 *   viewport-only counting (that mixes historical distance into badge).
 * - When lastRead is set but missing from the loaded window, return 0.
 */
export function countUnreadMessagesBelow(input: {
  messages: readonly FirstUnreadMessageRow[];
  lastReadMessageId: string | null | undefined;
  afterMessageId: string | null | undefined;
}): number {
  const after = typeof input.afterMessageId === "string" ? input.afterMessageId.trim() : "";
  const msgs = input.messages;
  if (msgs.length === 0) return 0;

  const lastRead = typeof input.lastReadMessageId === "string" ? input.lastReadMessageId.trim() : "";
  if (!lastRead) {
    return 0;
  }

  const lastReadIdx = msgs.findIndex((m) => m.id === lastRead);
  if (lastReadIdx < 0) {
    return 0;
  }

  let start = lastReadIdx + 1;
  if (after) {
    const afterIdx = msgs.findIndex((m) => m.id === after);
    start = Math.max(afterIdx, lastReadIdx) + 1;
  }

  let n = 0;
  for (let i = start; i < msgs.length; i += 1) {
    if (isUnreadCandidate(msgs[i]!)) n += 1;
  }
  return n;
}

export function resolveNextUnreadMessageId(input: {
  messages: readonly FirstUnreadMessageRow[];
  lastReadMessageId: string | null | undefined;
  afterMessageId: string | null | undefined;
}): string | null {
  const after =
    typeof input.afterMessageId === "string" ? input.afterMessageId.trim() : "";
  const lastRead =
    typeof input.lastReadMessageId === "string" ? input.lastReadMessageId.trim() : "";
  const afterIdx = after ? input.messages.findIndex((row) => row.id === after) : -1;
  const lastReadIdx = lastRead
    ? input.messages.findIndex((row) => row.id === lastRead)
    : -1;
  for (let i = Math.max(afterIdx, lastReadIdx) + 1; i < input.messages.length; i += 1) {
    const row = input.messages[i]!;
    if (isUnreadCandidate(row)) return String(row.id).trim();
  }
  return null;
}

export function formatUnreadBadgeCount(count: number): string {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return "";
  if (n > 99) return "99+";
  return String(n);
}

/**
 * FAB visibility + badge from canonical unread rows remaining below the viewport.
 */
export function resolveJumpToLatestFabState(input: {
  atLatest: boolean;
  remainingUnreadCount: number;
}): { visible: boolean; badgeCount: number } {
  const remaining = Math.max(0, Math.floor(Number(input.remainingUnreadCount) || 0));
  if (remaining > 0) {
    return { visible: true, badgeCount: remaining };
  }
  if (input.atLatest) {
    return { visible: false, badgeCount: 0 };
  }
  return { visible: true, badgeCount: 0 };
}

/**
 * Telegram pagedown contract (ChatActivity.pagedownButton):
 * - Still above first-unread boundary → jump to that message once
 * - Otherwise (catch-up below / no boundary) → jump to latest
 * Never step one-unread-at-a-time through the remaining badge count.
 */
export type JumpToLatestFabAction =
  | { kind: "first_unread"; messageId: string }
  | { kind: "latest" };

export function resolveJumpToLatestFabAction(input: {
  messages: readonly FirstUnreadMessageRow[];
  lastReadMessageId: string | null | undefined;
  lastVisibleMessageId: string | null | undefined;
  remainingUnreadCount: number;
}): JumpToLatestFabAction {
  const remaining = Math.max(0, Math.floor(Number(input.remainingUnreadCount) || 0));
  if (remaining <= 0) return { kind: "latest" };

  const firstUnread = resolveFirstUnreadMessageId({
    messages: input.messages,
    lastReadMessageId: input.lastReadMessageId,
  });
  if (!firstUnread) return { kind: "latest" };

  const firstIdx = input.messages.findIndex((row) => row.id === firstUnread);
  if (firstIdx < 0) return { kind: "latest" };

  const after =
    typeof input.lastVisibleMessageId === "string" ? input.lastVisibleMessageId.trim() : "";
  const visibleIdx = after ? input.messages.findIndex((row) => row.id === after) : -1;

  /** Viewport has not reached the first-unread row yet → Telegram createUnreadMessageAfterId jump. */
  if (visibleIdx < 0 || visibleIdx < firstIdx) {
    return { kind: "first_unread", messageId: firstUnread };
  }
  return { kind: "latest" };
}
