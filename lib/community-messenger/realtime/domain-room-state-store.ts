/**
 * Phase R — DomainRoomStateStore (app-global Realtime Spine SSOT).
 *
 * RoomEvent → reduce → (List cache mirror) → Projection Builder → Apply
 */
"use client";

import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import { peekBootstrapCache, primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { applyHomeListPatch, findHomeListRoomRow } from "@/lib/community-messenger/home-list-patch";
import { listPreviewFromMessengerMessageRow } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { buildNotificationBadgeProjection } from "@/lib/notifications/build-notification-badge-projection";
import { getNotificationBadgeCountSnapshot } from "@/lib/notifications/notification-badge-count-store";
import {
  createEmptyDomainRoomStateSnapshot,
  reduceDomainRoomEvent,
  countUnreadRoomsByDomain,
  rowUnreadByRoomId,
} from "@/lib/community-messenger/realtime/reduce-domain-room-event";
import {
  normalizeDomainRoomId,
  type DomainRoomEvent,
  type DomainRoomListState,
  type DomainRoomStateSnapshot,
} from "@/lib/community-messenger/realtime/domain-room-state-types";
import { isChatDomain, requireChatDomain } from "@/lib/chat-domain/chat-domain";
import { requireDomainIdentityKey } from "@/lib/chat-domain/room-identity";

export const DOMAIN_ROOM_STATE_CHANGED_EVENT = "samarket:domain-room-state-changed";

let snapshot: DomainRoomStateSnapshot = createEmptyDomainRoomStateSnapshot();
const listeners = new Set<(next: DomainRoomStateSnapshot) => void>();
/** roomKey → last applied message id (dedupe message + bump) */
const lastAppliedMessageIdByRoom = new Map<string, string>();
/** roomKey → last reduce wall clock (bump coalesce) */
const lastReduceAtByRoom = new Map<string, number>();

export function getDomainRoomStateSnapshot(): DomainRoomStateSnapshot {
  return snapshot;
}

export function subscribeDomainRoomState(
  listener: (next: DomainRoomStateSnapshot) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit(next: DomainRoomStateSnapshot): void {
  for (const listener of listeners) listener(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DOMAIN_ROOM_STATE_CHANGED_EVENT, {
        detail: { generation: next.generation },
      })
    );
  }
}

function applyProjectionFromRoomState(state: DomainRoomStateSnapshot): void {
  if (typeof window === "undefined") return;
  const domainUnreadRooms = countUnreadRoomsByDomain(state.rooms);
  const prevBell = getNotificationBadgeCountSnapshot();
  const projection = buildNotificationBadgeProjection({
    domainUnreadRooms,
    orphanMissedCall: Math.max(0, Math.floor(Number(prevBell?.missedCall) || 0)),
    nonChatEventAttention: {
      tradeStatus: Math.max(0, Math.floor(Number(prevBell?.tradeStatus) || 0)),
      orderStatus: Math.max(0, Math.floor(Number(prevBell?.orderStatus) || 0)),
      deliveryStatus: Math.max(0, Math.floor(Number(prevBell?.deliveryStatus) || 0)),
      communityActivity: Math.max(0, Math.floor(Number(prevBell?.communityActivity) || 0)),
      adminNotice: Math.max(0, Math.floor(Number(prevBell?.adminNotice) || 0)),
    },
    rowUnreadByRoomId: rowUnreadByRoomId(state.rooms),
  });
  // Dynamic import — keep community-messenger → lib/messenger static import count at 0 (Phase 4.5/6/7/8A).
  void import("@/lib/messenger/contracts/domain-badge-authority-product-bridge").then((mod) => {
    mod.applyNotificationBadgeProjection(projection, { applyBell: true });
  });
}

export function roomSummaryToListState(
  room: NonNullable<ReturnType<typeof findHomeListRoomRow>>
): DomainRoomListState | null {
  if (!isChatDomain(room.chatDomain)) return null;
  try {
    const identityKey = requireDomainIdentityKey(room.domainIdentityKey);
    return {
      roomId: String(room.id).trim(),
      chatDomain: room.chatDomain,
      domainIdentityKey: identityKey,
      previewText: String(room.lastMessage ?? ""),
      lastMessageAt: String(room.lastMessageAt ?? ""),
      lastMessageType: String(room.lastMessageType ?? "text"),
      unreadCount: Math.max(0, Math.floor(Number(room.unreadCount) || 0)),
      title: room.title,
    };
  } catch {
    return null;
  }
}

/**
 * Telegram list authority: hub session cache mirror MUST go through applyHomeListPatch only.
 * DO NOT call patchBootstrapRoomList* / chats.map here.
 */
function mirrorListCacheAfterEvent(event: DomainRoomEvent): void {
  const cache = peekBootstrapCache();
  if (!cache) return;
  if (event.type === "message") {
    const messageRow = {
      id: event.messageId,
      content: event.previewText,
      message_type: event.lastMessageType,
      created_at: event.lastMessageAt,
    };
    const next = event.boostUnread
      ? applyHomeListPatch(
          cache,
          {
            kind: "realtime_message_insert",
            roomId: event.roomId,
            messageRow,
            boostUnreadCount: true,
          },
          "realtime"
        )
      : applyHomeListPatch(
          cache,
          {
            kind: "sender_local_echo",
            roomId: event.roomId,
            preview: {
              lastMessage: event.previewText,
              lastMessageType: event.lastMessageType as never,
              lastMessageAt: event.lastMessageAt,
            },
          },
          "realtime"
        );
    if (next && next !== cache) primeBootstrapCache(next);
    return;
  }
  if (event.type === "read") {
    const next = applyHomeListPatch(
      cache,
      { kind: "local_unread", roomId: event.roomId, unreadCount: 0 },
      "mark-read"
    );
    if (next && next !== cache) primeBootstrapCache(next);
    return;
  }
  if (event.type === "snapshot") {
    let cur: CommunityMessengerBootstrap = cache;
    for (const room of event.rooms) {
      const existing = findHomeListRoomRow(cur, room.roomId);
      if (!existing) continue;
      if (room.unreadCount > 0) {
        const patched = applyHomeListPatch(
          cur,
          {
            kind: "realtime_message_insert",
            roomId: room.roomId,
            messageRow: {
              id: `snapshot:${room.roomId}:${room.lastMessageAt}`,
              content: room.previewText,
              message_type: room.lastMessageType,
              created_at: room.lastMessageAt,
            },
            boostUnreadCount: false,
          },
          "multi-tab"
        );
        cur = patched ?? cur;
      } else {
        const patched = applyHomeListPatch(
          cur,
          {
            kind: "sender_local_echo",
            roomId: room.roomId,
            preview: {
              lastMessage: room.previewText,
              lastMessageType: room.lastMessageType as never,
              lastMessageAt: room.lastMessageAt,
            },
          },
          "multi-tab"
        );
        cur = patched ?? cur;
      }
      const row = findHomeListRoomRow(cur, room.roomId);
      if (row && row.unreadCount !== room.unreadCount) {
        const unreadPatched = applyHomeListPatch(
          cur,
          { kind: "local_unread", roomId: room.roomId, unreadCount: room.unreadCount },
          "multi-tab"
        );
        cur = unreadPatched ?? cur;
      }
    }
    if (cur !== cache) primeBootstrapCache(cur);
  }
}

/**
 * THE spine entry — all realtime/bootstrap/read/refresh adapters call this.
 */
export function dispatchDomainRoomEvent(
  event: DomainRoomEvent,
  opts?: { applySurfaces?: boolean; mirrorListCache?: boolean }
): DomainRoomStateSnapshot {
  const applySurfaces = opts?.applySurfaces !== false;
  const mirrorListCache = opts?.mirrorListCache !== false;

  if (event.type === "message") {
    const key = normalizeDomainRoomId(event.roomId);
    const mid = String(event.messageId ?? "").trim();
    if (key && mid && lastAppliedMessageIdByRoom.get(key) === mid) {
      return snapshot;
    }
    if (key && mid) lastAppliedMessageIdByRoom.set(key, mid);
    if (key) lastReduceAtByRoom.set(key, Date.now());
  }

  if (event.type === "read") {
    const key = normalizeDomainRoomId(event.roomId);
    if (key) lastReduceAtByRoom.set(key, Date.now());
  }

  const next = reduceDomainRoomEvent(snapshot, event);
  if (next === snapshot) {
    return snapshot;
  }
  snapshot = next;
  if (mirrorListCache) mirrorListCacheAfterEvent(event);
  if (applySurfaces) applyProjectionFromRoomState(next);
  emit(next);
  return next;
}

/** Soft bump without message payload — unread+sort only when recent message reduce missing. */
export function dispatchDomainRoomBump(roomId: string, at = Date.now()): DomainRoomStateSnapshot {
  const key = normalizeDomainRoomId(roomId);
  if (!key) return snapshot;
  const lastAt = lastReduceAtByRoom.get(key) ?? 0;
  if (at - lastAt < 1_500) return snapshot;
  const cur = snapshot.rooms.get(key);
  if (!cur) {
    const cached = findHomeListRoomRow(peekBootstrapCache(), roomId);
    const seeded = cached ? roomSummaryToListState(cached) : null;
    if (!seeded) return snapshot;
    return dispatchDomainRoomEvent({
      type: "message",
      roomId: seeded.roomId,
      chatDomain: seeded.chatDomain,
      domainIdentityKey: seeded.domainIdentityKey,
      messageId: `bump:${at}`,
      previewText: seeded.previewText,
      lastMessageAt: new Date(at).toISOString(),
      lastMessageType: seeded.lastMessageType,
      boostUnread: true,
      title: seeded.title,
    });
  }
  return dispatchDomainRoomEvent({
    type: "message",
    roomId: cur.roomId,
    chatDomain: cur.chatDomain,
    domainIdentityKey: cur.domainIdentityKey,
    messageId: `bump:${at}`,
    previewText: cur.previewText,
    lastMessageAt: new Date(at).toISOString(),
    lastMessageType: cur.lastMessageType,
    boostUnread: true,
    title: cur.title,
  });
}

export function seedDomainRoomStateFromBootstrap(
  data: CommunityMessengerBootstrap | null | undefined,
  viewerUserId?: string | null
): DomainRoomStateSnapshot {
  if (!data) return snapshot;
  const rooms: DomainRoomListState[] = [];
  const push = (row: (typeof data.chats)[number] | undefined) => {
    if (!row) return;
    const mapped = roomSummaryToListState(row);
    if (mapped) rooms.push(mapped);
  };
  for (const r of data.chats ?? []) push(r);
  for (const r of data.groups ?? []) push(r);
  if (rooms.length === 0) return snapshot;
  if (viewerUserId?.trim()) {
    snapshot = { ...snapshot, viewerUserId: viewerUserId.trim() };
  }
  return dispatchDomainRoomEvent(
    { type: "snapshot", mode: "replace", rooms },
    { applySurfaces: false, mirrorListCache: false }
  );
}

export function mergeDomainRoomStateFromBootstrap(
  data: CommunityMessengerBootstrap | null | undefined
): DomainRoomStateSnapshot {
  if (!data) return snapshot;
  const rooms: DomainRoomListState[] = [];
  for (const r of [...(data.chats ?? []), ...(data.groups ?? [])]) {
    const mapped = roomSummaryToListState(r);
    if (mapped) rooms.push(mapped);
  }
  if (rooms.length === 0) return snapshot;
  return dispatchDomainRoomEvent(
    { type: "snapshot", mode: "merge", rooms },
    { applySurfaces: false, mirrorListCache: false }
  );
}

export function resetDomainRoomStateStoreForTests(): void {
  snapshot = createEmptyDomainRoomStateSnapshot();
  lastAppliedMessageIdByRoom.clear();
  lastReduceAtByRoom.clear();
  listeners.clear();
}

/** Adapter helpers used by Host */
export function domainRoomMessageEventFromBusIncoming(args: {
  roomId: string;
  chatDomain: string;
  domainIdentityKey: string;
  messageRow: Record<string, unknown>;
  boostUnread: boolean;
  title?: string;
}): DomainRoomEvent | null {
  try {
    const domain = requireChatDomain(args.chatDomain);
    const identityKey = requireDomainIdentityKey(args.domainIdentityKey);
    const preview = listPreviewFromMessengerMessageRow(args.messageRow);
    if (!preview) return null;
    const messageId =
      typeof args.messageRow.id === "string"
        ? args.messageRow.id.trim()
        : typeof args.messageRow.message_id === "string"
          ? String(args.messageRow.message_id).trim()
          : "";
    if (!messageId) return null;
    return {
      type: "message",
      roomId: args.roomId.trim(),
      chatDomain: domain,
      domainIdentityKey: identityKey,
      messageId,
      previewText: preview.lastMessage,
      lastMessageAt: preview.lastMessageAt,
      lastMessageType: String(preview.lastMessageType ?? "text"),
      boostUnread: args.boostUnread,
      title: args.title,
    };
  } catch {
    return null;
  }
}

export function domainRoomReadEventFromRoom(args: {
  roomId: string;
  chatDomain?: string | null;
  domainIdentityKey?: string | null;
}): DomainRoomEvent | null {
  const rid = args.roomId.trim();
  if (!rid) return null;
  const cached = findHomeListRoomRow(peekBootstrapCache(), rid);
  const cur = snapshot.rooms.get(normalizeDomainRoomId(rid));
  try {
    const domain = requireChatDomain(args.chatDomain ?? cur?.chatDomain ?? cached?.chatDomain);
    const identityKey = requireDomainIdentityKey(
      args.domainIdentityKey ?? cur?.domainIdentityKey ?? cached?.domainIdentityKey
    );
    return {
      type: "read",
      roomId: rid,
      chatDomain: domain,
      domainIdentityKey: identityKey,
    };
  } catch {
    return null;
  }
}
