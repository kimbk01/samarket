"use client";

/** room 나갔다 재진입 시 scrollTop·anchor message 복원 — subtree TTL(15s)보다 길게 유지 */
export const MESSENGER_ROOM_SCROLL_PERSIST_TTL_MS = 60_000;

export type MessengerRoomScrollPersistEntry = {
  scrollTop: number;
  firstVisibleMessageId: string | null;
  stickToBottom: boolean;
  updatedAt: number;
};

const byRoomId = new Map<string, MessengerRoomScrollPersistEntry>();

export function saveMessengerRoomScrollPosition(
  roomId: string,
  entry: Omit<MessengerRoomScrollPersistEntry, "updatedAt"> & { updatedAt?: number }
): void {
  const id = roomId.trim();
  if (!id) return;
  byRoomId.set(id, {
    scrollTop: Math.max(0, entry.scrollTop),
    firstVisibleMessageId: entry.firstVisibleMessageId?.trim() || null,
    stickToBottom: entry.stickToBottom,
    updatedAt: entry.updatedAt ?? Date.now(),
  });
}

export function peekMessengerRoomScrollPosition(roomId: string): MessengerRoomScrollPersistEntry | null {
  const id = roomId.trim();
  if (!id) return null;
  const row = byRoomId.get(id);
  if (!row) return null;
  if (Date.now() - row.updatedAt > MESSENGER_ROOM_SCROLL_PERSIST_TTL_MS) {
    byRoomId.delete(id);
    return null;
  }
  return row;
}

export function consumeMessengerRoomScrollPosition(roomId: string): MessengerRoomScrollPersistEntry | null {
  const row = peekMessengerRoomScrollPosition(roomId);
  if (!row) return null;
  return { ...row };
}

export function clearMessengerRoomScrollPosition(roomId: string): void {
  const id = roomId.trim();
  if (!id) return;
  byRoomId.delete(id);
}

const ROW_SELECTOR = "[data-cm-timeline-message-row]";

/** viewport DOM에서 first visible message id 추출 */
export function readFirstVisibleTimelineMessageId(viewport: HTMLElement | null): string | null {
  if (!viewport || typeof viewport.querySelector !== "function") return null;
  const rootRect = viewport.getBoundingClientRect();
  const rows = viewport.querySelectorAll<HTMLElement>(ROW_SELECTOR);
  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (rect.height <= 0) continue;
    if (rect.bottom <= rootRect.top + 2) continue;
    if (rect.top >= rootRect.bottom - 2) continue;
    const id = row.getAttribute("data-cm-message-id")?.trim();
    if (id) return id;
  }
  return null;
}

export function snapshotScrollFromViewport(
  viewport: HTMLElement | null,
  stickToBottom: boolean
): Omit<MessengerRoomScrollPersistEntry, "updatedAt"> | null {
  if (!viewport) return null;
  return {
    scrollTop: viewport.scrollTop,
    firstVisibleMessageId: readFirstVisibleTimelineMessageId(viewport),
    stickToBottom,
  };
}

/** message id → scrollTop (fallback when persisted scrollTop stale after prepend) */
export function resolveScrollTopForAnchorMessage(
  viewport: HTMLElement,
  messageId: string
): number | null {
  const id = messageId.trim();
  if (!id) return null;
  const row = viewport.querySelector<HTMLElement>(`[data-cm-message-id="${CSS.escape(id)}"]`);
  if (!row) return null;
  const vpRect = viewport.getBoundingClientRect();
  const rowRect = row.getBoundingClientRect();
  const delta = rowRect.top - vpRect.top;
  return Math.max(0, viewport.scrollTop + delta);
}

export function __resetMessengerRoomScrollPositionStoreForTest(): void {
  byRoomId.clear();
}
