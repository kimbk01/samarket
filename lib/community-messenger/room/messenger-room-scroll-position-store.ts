"use client";

import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { APP_SCROLL_TTL_MS } from "@/lib/navigation/app-scroll-memory";

/**
 * 방에서 읽던 위치 보관 — 「뒤로 돌아옴」 진입(D4)에서만 읽는다(`messenger-room-return-entry`).
 * D4 (Owner 「D4 진행」 2026-11-09): 앱 전체 위치 규칙(30분, `APP_SCROLL_TTL_MS`)과 같게 — 이전 60초는
 * 링크·상세를 잠깐 보고 와도 지나 버려 쓸 수 없었다.
 */
export const MESSENGER_ROOM_SCROLL_PERSIST_TTL_MS = APP_SCROLL_TTL_MS;

export type MessengerRoomScrollPersistEntry = {
  scrollTop: number;
  firstVisibleMessageId: string | null;
  /** 보던 첫 메시지 줄의 위쪽 끝 − 대화 상자 위쪽 끝(px). 복원 때 같은 자리에 오게 한다. */
  anchorOffsetPx?: number;
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
  const anchor = entry.firstVisibleMessageId?.trim() || null;
  /**
   * 화면에서 떼어진 뒤(방을 나가는 정리 단계) 재면 보던 메시지를 못 찾는다 — 그 값으로 직전 위치를 덮어쓰지 않는다.
   * 맨 아래 상태(stickToBottom)는 그대로 기록한다.
   */
  if (!entry.stickToBottom && !anchor && byRoomId.get(id)?.firstVisibleMessageId) return;
  byRoomId.set(id, {
    scrollTop: Math.max(0, entry.scrollTop),
    firstVisibleMessageId: anchor,
    ...(typeof entry.anchorOffsetPx === "number" && Number.isFinite(entry.anchorOffsetPx)
      ? { anchorOffsetPx: entry.anchorOffsetPx }
      : {}),
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
  historyByRoomId.delete(id);
}

// ─── 돌아옴 진입용 — 나갈 때 불러와 있던 메시지 보관 (D4) ─────────────────────

/** 보관하는 방 수 · 방마다 메시지 수 상한 (메모리) */
export const MESSENGER_ROOM_RETURN_HISTORY_MAX_ROOMS = 3;
export const MESSENGER_ROOM_RETURN_HISTORY_MAX_MESSAGES = 1000;

type ReturnHistoryEntry = { messages: CommunityMessengerMessage[]; updatedAt: number };
const historyByRoomId = new Map<string, ReturnHistoryEntry>();

/**
 * 읽던 위치가 처음 불러오는 최신 분량 밖(지난 메시지를 위로 불러와 읽던 중)이어도 돌아오면 그 메시지가 있도록,
 * 나갈 때 불러와 있던 메시지를 보관한다. 보내는 중(pending) 메시지는 빼고, 최신 쪽 상한만큼만.
 */
export function saveMessengerRoomReturnHistory(
  roomId: string,
  /** 방 타임라인의 메시지 행 그대로(전체 메시지 객체) — 스크롤 컨트롤러는 좁은 타입으로 들고 있다 */
  messages: ReadonlyArray<{ id?: string | null; pending?: boolean }>,
  now = Date.now()
): void {
  const id = roomId.trim();
  if (!id) return;
  const persisted = messages.filter((m) => !m.pending && typeof m.id === "string" && m.id.trim().length > 0);
  if (persisted.length === 0) {
    historyByRoomId.delete(id);
    return;
  }
  historyByRoomId.delete(id);
  historyByRoomId.set(id, {
    messages: persisted.slice(-MESSENGER_ROOM_RETURN_HISTORY_MAX_MESSAGES) as unknown as CommunityMessengerMessage[],
    updatedAt: now,
  });
  while (historyByRoomId.size > MESSENGER_ROOM_RETURN_HISTORY_MAX_ROOMS) {
    const oldest = historyByRoomId.keys().next().value;
    if (oldest === undefined) break;
    historyByRoomId.delete(oldest);
  }
}

export function peekMessengerRoomReturnHistory(roomId: string, now = Date.now()): CommunityMessengerMessage[] | null {
  const id = roomId.trim();
  if (!id) return null;
  const row = historyByRoomId.get(id);
  if (!row) return null;
  if (now - row.updatedAt > MESSENGER_ROOM_SCROLL_PERSIST_TTL_MS) {
    historyByRoomId.delete(id);
    return null;
  }
  return row.messages;
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
  const firstVisibleMessageId = readFirstVisibleTimelineMessageId(viewport);
  let anchorOffsetPx: number | undefined;
  if (firstVisibleMessageId && typeof viewport.querySelector === "function") {
    const row = viewport.querySelector<HTMLElement>(`[data-cm-message-id="${CSS.escape(firstVisibleMessageId)}"]`);
    if (row) anchorOffsetPx = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
  }
  return {
    scrollTop: viewport.scrollTop,
    firstVisibleMessageId,
    ...(anchorOffsetPx !== undefined ? { anchorOffsetPx } : {}),
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
  historyByRoomId.clear();
}
