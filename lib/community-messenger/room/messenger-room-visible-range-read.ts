/**
 * Visible-range partial read — pure helpers (DOM-free).
 *
 * CONTRACT (Final Stabilization §5 / chat-thread-scroll-contract):
 * - Advance viewer cursor only to rows actually marked visible.
 * - Cursor is monotonic in canonical timeline order.
 * - Rows not yet visible (incl. concurrent new arrivals) are not marked read.
 * - Remaining unread = unread-eligible rows after the advanced cursor.
 */

import {
  countUnreadMessagesBelow,
  type FirstUnreadMessageRow,
} from "@/lib/community-messenger/room/messenger-room-first-unread";

export type VisibleRangeReadRow = FirstUnreadMessageRow & {
  id?: string;
  pending?: boolean;
};

export function messageIndexInTimeline(
  messages: readonly VisibleRangeReadRow[],
  messageId: string | null | undefined
): number {
  const id = typeof messageId === "string" ? messageId.trim() : "";
  if (!id) return -1;
  return messages.findIndex((row) => String(row.id ?? "").trim() === id);
}

/**
 * True when `nextId` is strictly after `prevId` in canonical order.
 * Missing prev → any next is allowed. Missing next → false.
 * Either id absent from the window → allow (server/window skew); caller still
 * must not invent ids outside the visible set.
 */
export function isReadCursorMonotonicAdvance(input: {
  messages: readonly VisibleRangeReadRow[];
  previousCursorId: string | null | undefined;
  nextCursorId: string | null | undefined;
}): boolean {
  const next = typeof input.nextCursorId === "string" ? input.nextCursorId.trim() : "";
  if (!next) return false;
  const prev = typeof input.previousCursorId === "string" ? input.previousCursorId.trim() : "";
  if (!prev) return true;
  if (prev === next) return false;
  const prevIdx = messageIndexInTimeline(input.messages, prev);
  const nextIdx = messageIndexInTimeline(input.messages, next);
  if (prevIdx < 0 || nextIdx < 0) return true;
  return nextIdx > prevIdx;
}

/**
 * Last markable (non-pending) message id that isVisible(id) among rows after previousCursor.
 * Does not skip call_stub — same timeline as unread eligibility for cursor placement.
 */
export function resolveVisibleRangeReadCursor(input: {
  messages: readonly VisibleRangeReadRow[];
  previousCursorId: string | null | undefined;
  isVisible: (messageId: string) => boolean;
}): string | null {
  const list = input.messages;
  if (list.length === 0) return null;
  const after = typeof input.previousCursorId === "string" ? input.previousCursorId.trim() : "";
  const afterIndex = after ? messageIndexInTimeline(list, after) : -1;
  let candidate: string | null = null;
  for (let i = afterIndex + 1; i < list.length; i += 1) {
    const row = list[i]!;
    if (row.pending) continue;
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    if (input.isVisible(id)) candidate = id;
  }
  return candidate;
}

/** Remaining unread-eligible rows after an advanced viewer cursor. */
export function countRemainingUnreadAfterCursor(input: {
  messages: readonly FirstUnreadMessageRow[];
  viewerLastReadMessageId: string | null | undefined;
}): number {
  return countUnreadMessagesBelow({
    messages: input.messages,
    lastReadMessageId: input.viewerLastReadMessageId,
    afterMessageId: null,
  });
}
