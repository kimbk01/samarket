/**
 * Message Authority — sole writer for CM room timelines.
 *
 * Allowed ops only:
 * 1. append (new message)
 * 2. update
 * 3. remove
 * 4. read cursor
 * 5. preview (outbound list bus stays call-site; no list store write here)
 *
 * DO NOT: full replace, rAF batch, bootstrap re-seed when already seeded.
 */

import { callStubSessionDedupeKeys } from "@/lib/community-messenger/call-event-message";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  clearRoomMessageStore,
  getRoomMessagesArray,
  peekRoomMessageState,
  storeAppendIfMissing,
  storeFindByClientMessageId,
  storeHasMessageId,
  storePrependOlder,
  storeRemoveMatching,
  storeRemoveMessage,
  storeSeedOnce,
  storeSetReadCursor,
  storeUpsertMessage,
  type RoomTimelineMessage,
} from "@/lib/community-messenger/room/message-authority/room-message-store";

export type { RoomTimelineMessage };

export type RealtimeTimelineEvent = {
  eventType: string;
  message: CommunityMessengerMessage | { id: string };
};

function trimId(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function removePendingMatchedByConfirmed(
  roomId: string,
  confirmed: CommunityMessengerMessage
): void {
  const cid = trimId(confirmed.clientMessageId);
  storeRemoveMatching(roomId, (row) => {
    if (!row.pending) return false;
    if (row.senderId !== confirmed.senderId || row.messageType !== confirmed.messageType) return false;
    const rowCid = trimId(row.clientMessageId);
    if (cid && rowCid && cid === rowCid) return true;
    const dt = Math.abs(new Date(confirmed.createdAt).getTime() - new Date(row.createdAt).getTime());
    if (row.messageType === "voice") return dt < 15_000;
    if (row.messageType === "sticker") {
      return confirmed.messageType === "sticker" && confirmed.content === row.content && dt < 15_000;
    }
    if (row.messageType === "file") {
      return confirmed.fileName === row.fileName && dt < 15_000;
    }
    return confirmed.content === row.content && dt < 15_000;
  });
}

function removeConflictingCallStubs(roomId: string, incoming: CommunityMessengerMessage): void {
  const keys = callStubSessionDedupeKeys(incoming);
  if (keys.length === 0) return;
  const incomingId = trimId(incoming.id);
  const incomingIsLocal = incomingId.startsWith("cm-cevt-");
  storeRemoveMatching(roomId, (row) => {
    const existingId = trimId(row.id);
    if (existingId === incomingId) return false;
    const existingKeys = callStubSessionDedupeKeys(row);
    if (!existingKeys.some((k) => keys.includes(k))) return false;
    const existingIsLocal = existingId.startsWith("cm-cevt-");
    if (existingIsLocal || !incomingIsLocal) return true;
    return false;
  });
}

function removeDuplicateClientIds(roomId: string, incoming: CommunityMessengerMessage): void {
  const cid = trimId(incoming.clientMessageId);
  const incomingId = trimId(incoming.id);
  if (!cid) return;
  storeRemoveMatching(roomId, (row) => {
    const rowCid = trimId(row.clientMessageId);
    return rowCid === cid && trimId(row.id) !== incomingId;
  });
}

/** Bootstrap seed — only when store empty / never seeded. */
export function authoritySeedBootstrap(roomId: string, messages: RoomTimelineMessage[]): boolean {
  return storeSeedOnce(roomId, messages);
}

/** Force clear then seed (room remount with different identity only). Prefer seedBootstrap. */
export function authorityResetAndSeed(roomId: string, messages: RoomTimelineMessage[]): void {
  clearRoomMessageStore(roomId);
  storeSeedOnce(roomId, messages);
}

/**
 * Realtime / bump — one message per call.
 * INSERT → append or update; UPDATE → update; DELETE → remove.
 */
export function authorityApplyRealtime(roomId: string, event: RealtimeTimelineEvent): void {
  const rid = roomId.trim();
  if (!rid) return;
  const mid = trimId(event.message.id);
  if (event.eventType === "DELETE") {
    if (mid) storeRemoveMessage(rid, mid);
    return;
  }
  if (!mid) return;
  const message = event.message as CommunityMessengerMessage;
  if (event.eventType === "UPDATE" || storeHasMessageId(rid, mid)) {
    storeUpsertMessage(rid, { ...message, pending: false });
    return;
  }
  removeConflictingCallStubs(rid, message);
  removeDuplicateClientIds(rid, message);
  removePendingMatchedByConfirmed(rid, message);
  storeAppendIfMissing(rid, { ...message, pending: false });
}

/**
 * Catch-up: append missing ids only. Never replace. Never re-seed.
 * Returns count of newly appended rows.
 */
export function authorityApplyCatchUp(roomId: string, messages: CommunityMessengerMessage[]): number {
  const rid = roomId.trim();
  if (!rid || messages.length === 0) return 0;
  let n = 0;
  for (const msg of messages) {
    const id = trimId(msg.id);
    if (!id || storeHasMessageId(rid, id)) continue;
    removeConflictingCallStubs(rid, msg);
    removeDuplicateClientIds(rid, msg);
    removePendingMatchedByConfirmed(rid, msg);
    if (storeAppendIfMissing(rid, { ...msg, pending: false })) n += 1;
  }
  return n;
}

export function authorityApplyOptimistic(roomId: string, message: RoomTimelineMessage): void {
  storeUpsertMessage(roomId, { ...message, pending: true });
}

export function authorityConfirmOptimistic(
  roomId: string,
  confirmed: CommunityMessengerMessage,
  clientMessageId?: string
): void {
  const rid = roomId.trim();
  const cid = trimId(clientMessageId) || trimId(confirmed.clientMessageId);
  if (cid) {
    storeRemoveMatching(rid, (row) => row.pending === true && trimId(row.clientMessageId) === cid);
  } else {
    removePendingMatchedByConfirmed(rid, confirmed);
  }
  removeDuplicateClientIds(rid, confirmed);
  storeUpsertMessage(rid, {
    ...confirmed,
    clientMessageId: cid || confirmed.clientMessageId,
    pending: false,
  });
}

export function authorityFailOptimistic(roomId: string, tempId: string): void {
  storeRemoveMessage(roomId, tempId);
}

export function authorityPrependOlder(roomId: string, messages: CommunityMessengerMessage[]): number {
  return storePrependOlder(
    roomId,
    messages.map((m) => ({ ...m, pending: false }))
  );
}

export function authorityApplyEdit(roomId: string, message: CommunityMessengerMessage): void {
  const id = trimId(message.id);
  if (!id) return;
  storeUpsertMessage(roomId, { ...message, pending: false });
}

export function authorityApplyDelete(roomId: string, messageId: string): void {
  storeRemoveMessage(roomId, messageId);
}

export function authorityApplyReaction(
  roomId: string,
  messageId: string,
  patch: Partial<CommunityMessengerMessage>
): void {
  const rid = roomId.trim();
  const id = messageId.trim();
  const state = peekRoomMessageState(rid);
  const existing = state?.byId.get(id);
  if (!existing) return;
  storeUpsertMessage(rid, { ...existing, ...patch, id, pending: false });
}

export function authoritySetReadCursor(roomId: string, lastReadMessageId: string | null): void {
  storeSetReadCursor(roomId, lastReadMessageId);
}

export function authorityGetMessages(roomId: string): RoomTimelineMessage[] {
  return getRoomMessagesArray(roomId);
}

export function authorityFindPendingByClientId(
  roomId: string,
  clientMessageId: string
): RoomTimelineMessage | null {
  return storeFindByClientMessageId(roomId, clientMessageId);
}

export function authorityIsSeeded(roomId: string): boolean {
  const s = peekRoomMessageState(roomId);
  return Boolean(s?.seeded && s.order.length > 0);
}
