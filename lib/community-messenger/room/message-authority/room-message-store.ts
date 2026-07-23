/**
 * Room Message Store — Telegram-style single timeline authority backing store.
 *
 * CONTRACT:
 * - No full-array replace API.
 * - Messages keyed by id; order is an id list.
 * - Cap trim drops oldest confirmed ids only (pending kept).
 *
 * DO NOT: expose full-array replace APIs (setMessages / replaceAll).
 */

import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MESSENGER_TIMELINE_MESSAGES_CAP } from "@/lib/community-messenger/room/messenger-room-ui-constants";

export type RoomTimelineMessage = CommunityMessengerMessage & { pending?: boolean };

export type RoomMessageRoomState = {
  byId: Map<string, RoomTimelineMessage>;
  order: string[];
  generation: number;
  seeded: boolean;
  lastReadMessageId: string | null;
};

type Listener = (roomId: string, state: RoomMessageRoomState) => void;

const rooms = new Map<string, RoomMessageRoomState>();
const listeners = new Set<Listener>();

function emptyRoom(): RoomMessageRoomState {
  return {
    byId: new Map(),
    order: [],
    generation: 0,
    seeded: false,
    lastReadMessageId: null,
  };
}

function normalizeRoomId(roomId: string): string {
  return roomId.trim();
}

function bump(state: RoomMessageRoomState): void {
  state.generation += 1;
}

function emit(roomId: string, state: RoomMessageRoomState): void {
  for (const listener of listeners) listener(roomId, state);
}

function ensureRoom(roomId: string): RoomMessageRoomState {
  const rid = normalizeRoomId(roomId);
  let state = rooms.get(rid);
  if (!state) {
    state = emptyRoom();
    rooms.set(rid, state);
  }
  return state;
}

function sortOrder(state: RoomMessageRoomState): void {
  state.order.sort((aId, bId) => {
    const a = state.byId.get(aId);
    const b = state.byId.get(bId);
    if (!a || !b) return aId.localeCompare(bId);
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    if (Boolean(a.pending) !== Boolean(b.pending)) return a.pending ? 1 : -1;
    return aId.localeCompare(bId);
  });
}

function trimCap(state: RoomMessageRoomState): void {
  if (state.order.length <= MESSENGER_TIMELINE_MESSAGES_CAP) return;
  const overflow = state.order.length - MESSENGER_TIMELINE_MESSAGES_CAP;
  const drop: string[] = [];
  for (const id of state.order) {
    if (drop.length >= overflow) break;
    const row = state.byId.get(id);
    if (row?.pending) continue;
    drop.push(id);
  }
  for (const id of drop) {
    state.byId.delete(id);
  }
  if (drop.length > 0) {
    const dropSet = new Set(drop);
    state.order = state.order.filter((id) => !dropSet.has(id));
  }
}

export function subscribeRoomMessageStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function peekRoomMessageState(roomId: string): RoomMessageRoomState | null {
  const rid = normalizeRoomId(roomId);
  if (!rid) return null;
  return rooms.get(rid) ?? null;
}

export function getRoomMessagesArray(roomId: string): RoomTimelineMessage[] {
  const state = peekRoomMessageState(roomId);
  if (!state) return [];
  const out: RoomTimelineMessage[] = [];
  for (const id of state.order) {
    const row = state.byId.get(id);
    if (row) out.push(row);
  }
  return out;
}

export function roomMessageStoreHasSeed(roomId: string): boolean {
  return Boolean(peekRoomMessageState(roomId)?.seeded && (peekRoomMessageState(roomId)?.order.length ?? 0) > 0);
}

export function clearRoomMessageStore(roomId: string): void {
  const rid = normalizeRoomId(roomId);
  if (!rid) return;
  rooms.delete(rid);
  emit(rid, emptyRoom());
}

/** Test / room leave — wipe all rooms. */
export function resetRoomMessageStoreForTests(): void {
  rooms.clear();
}

/**
 * Seed only when room has never been seeded (or is empty).
 * Returns false if skipped (already seeded with rows).
 */
export function storeSeedOnce(roomId: string, messages: RoomTimelineMessage[]): boolean {
  const rid = normalizeRoomId(roomId);
  if (!rid) return false;
  const state = ensureRoom(rid);
  if (state.seeded && state.order.length > 0) return false;
  if (messages.length === 0) return false;
  state.byId.clear();
  state.order = [];
  for (const msg of messages) {
    const id = String(msg.id ?? "").trim();
    if (!id) continue;
    state.byId.set(id, { ...msg, pending: Boolean(msg.pending) });
    state.order.push(id);
  }
  if (state.order.length === 0) return false;
  sortOrder(state);
  trimCap(state);
  state.seeded = true;
  bump(state);
  emit(rid, state);
  return true;
}

export function storeUpsertMessage(roomId: string, message: RoomTimelineMessage): "inserted" | "updated" | "noop" {
  const rid = normalizeRoomId(roomId);
  const id = String(message.id ?? "").trim();
  if (!rid || !id) return "noop";
  const state = ensureRoom(rid);
  const existing = state.byId.get(id);
  if (existing) {
    const next = {
      ...existing,
      ...message,
      pending: Boolean(message.pending),
      metadata:
        message.metadata && Object.keys(message.metadata).length > 0
          ? message.metadata
          : existing.metadata,
    };
    state.byId.set(id, next);
    bump(state);
    emit(rid, state);
    return "updated";
  }
  state.byId.set(id, { ...message, pending: Boolean(message.pending) });
  state.order.push(id);
  sortOrder(state);
  trimCap(state);
  state.seeded = true;
  bump(state);
  emit(rid, state);
  return "inserted";
}

/** Append only if id is absent. Returns false if skipped. */
export function storeAppendIfMissing(roomId: string, message: RoomTimelineMessage): boolean {
  const rid = normalizeRoomId(roomId);
  const id = String(message.id ?? "").trim();
  if (!rid || !id) return false;
  const state = ensureRoom(rid);
  if (state.byId.has(id)) return false;
  return storeUpsertMessage(rid, message) === "inserted";
}

export function storeRemoveMessage(roomId: string, messageId: string): boolean {
  const rid = normalizeRoomId(roomId);
  const id = messageId.trim();
  if (!rid || !id) return false;
  const state = ensureRoom(rid);
  if (!state.byId.has(id)) return false;
  state.byId.delete(id);
  state.order = state.order.filter((x) => x !== id);
  bump(state);
  emit(rid, state);
  return true;
}

export function storeRemoveMatching(
  roomId: string,
  predicate: (m: RoomTimelineMessage) => boolean
): number {
  const rid = normalizeRoomId(roomId);
  if (!rid) return 0;
  const state = ensureRoom(rid);
  const removeIds: string[] = [];
  for (const id of state.order) {
    const row = state.byId.get(id);
    if (row && predicate(row)) removeIds.push(id);
  }
  for (const id of removeIds) {
    state.byId.delete(id);
  }
  if (removeIds.length > 0) {
    const set = new Set(removeIds);
    state.order = state.order.filter((id) => !set.has(id));
    bump(state);
    emit(rid, state);
  }
  return removeIds.length;
}

export function storeSetReadCursor(roomId: string, lastReadMessageId: string | null): void {
  const rid = normalizeRoomId(roomId);
  if (!rid) return;
  const state = ensureRoom(rid);
  const next = lastReadMessageId?.trim() || null;
  if (state.lastReadMessageId === next) return;
  state.lastReadMessageId = next;
  bump(state);
  emit(rid, state);
}

export function storePrependOlder(roomId: string, messages: RoomTimelineMessage[]): number {
  const rid = normalizeRoomId(roomId);
  if (!rid || messages.length === 0) return 0;
  let n = 0;
  for (const msg of messages) {
    if (storeAppendIfMissing(rid, msg)) n += 1;
  }
  return n;
}

export function storeHasMessageId(roomId: string, messageId: string): boolean {
  const state = peekRoomMessageState(roomId);
  if (!state) return false;
  return state.byId.has(messageId.trim());
}

export function storeFindByClientMessageId(
  roomId: string,
  clientMessageId: string
): RoomTimelineMessage | null {
  const state = peekRoomMessageState(roomId);
  const cid = clientMessageId.trim();
  if (!state || !cid) return null;
  for (const id of state.order) {
    const row = state.byId.get(id);
    if (!row) continue;
    const rowCid = typeof row.clientMessageId === "string" ? row.clientMessageId.trim() : "";
    if (rowCid === cid) return row;
  }
  return null;
}
