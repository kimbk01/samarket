/**
 * Phase R — pure DomainRoomState reducer (one event → list + unread fields).
 * No Surface writes here — DomainRoomStateStore notifies Projection Authority
 * with room unread deltas only (never incomplete full Projection overwrite).
 */
import type { ChatDomain } from "@/lib/chat-domain/chat-domain";
import { requireChatDomain } from "@/lib/chat-domain/chat-domain";
import {
  emptyDomainUnreadRoomCounts,
  normalizeDomainRoomId,
  type DomainRoomEvent,
  type DomainRoomListState,
  type DomainRoomStateSnapshot,
  type DomainUnreadRoomCounts,
} from "@/lib/community-messenger/realtime/domain-room-state-types";

function nonNeg(n: unknown): number {
  return Math.max(0, Math.floor(Number(n) || 0));
}

function sortKey(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function countUnreadRoomsByDomain(
  rooms: ReadonlyMap<string, DomainRoomListState>
): DomainUnreadRoomCounts {
  let general_direct = 0;
  let group = 0;
  let trade = 0;
  let store_order = 0;
  for (const room of rooms.values()) {
    if (nonNeg(room.unreadCount) <= 0) continue;
    const d = room.chatDomain;
    if (d === "general_direct") general_direct += 1;
    else if (d === "group") group += 1;
    else if (d === "trade") trade += 1;
    else if (d === "store_order") store_order += 1;
  }
  return { general_direct, group, trade, store_order };
}

export function rowUnreadByRoomId(
  rooms: ReadonlyMap<string, DomainRoomListState>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const room of rooms.values()) {
    const u = nonNeg(room.unreadCount);
    if (u > 0) out[room.roomId] = u;
  }
  return out;
}

/** Stable list order: lastMessageAt desc, roomId asc */
export function orderedDomainRooms(
  rooms: ReadonlyMap<string, DomainRoomListState>
): DomainRoomListState[] {
  return [...rooms.values()].sort((a, b) => {
    const tb = sortKey(b.lastMessageAt);
    const ta = sortKey(a.lastMessageAt);
    if (tb !== ta) return tb - ta;
    return a.roomId.localeCompare(b.roomId);
  });
}

function cloneMap(
  rooms: ReadonlyMap<string, DomainRoomListState>
): Map<string, DomainRoomListState> {
  return new Map(rooms);
}

function upsertRoom(
  map: Map<string, DomainRoomListState>,
  next: DomainRoomListState
): void {
  const key = normalizeDomainRoomId(next.roomId);
  map.set(key, { ...next, roomId: next.roomId.trim() || key });
}

export function createEmptyDomainRoomStateSnapshot(
  viewerUserId: string | null = null
): DomainRoomStateSnapshot {
  return {
    viewerUserId,
    rooms: new Map(),
    generation: 0,
  };
}

/**
 * THE Realtime Spine reducer — message | read | snapshot only.
 */
export function reduceDomainRoomEvent(
  prev: DomainRoomStateSnapshot,
  event: DomainRoomEvent
): DomainRoomStateSnapshot {
  if (event.type === "snapshot") {
    const map =
      event.mode === "replace" ? new Map<string, DomainRoomListState>() : cloneMap(prev.rooms);
    for (const room of event.rooms) {
      const domain = requireChatDomain(room.chatDomain);
      const rid = room.roomId.trim();
      if (!rid) continue;
      const key = normalizeDomainRoomId(rid);
      const existing = map.get(key);
      if (event.mode === "merge" && existing) {
        const existingAt = sortKey(existing.lastMessageAt);
        const incomingAt = sortKey(room.lastMessageAt);
        upsertRoom(map, {
          roomId: rid,
          chatDomain: domain,
          domainIdentityKey: room.domainIdentityKey.trim() || existing.domainIdentityKey,
          previewText:
            incomingAt >= existingAt
              ? room.previewText || existing.previewText
              : existing.previewText,
          lastMessageAt:
            incomingAt >= existingAt ? room.lastMessageAt || existing.lastMessageAt : existing.lastMessageAt,
          lastMessageType:
            incomingAt >= existingAt
              ? room.lastMessageType || existing.lastMessageType
              : existing.lastMessageType,
          unreadCount: nonNeg(room.unreadCount),
          title: room.title ?? existing.title,
        });
      } else {
        upsertRoom(map, {
          roomId: rid,
          chatDomain: domain,
          domainIdentityKey: room.domainIdentityKey.trim(),
          previewText: room.previewText || "",
          lastMessageAt: room.lastMessageAt || "",
          lastMessageType: room.lastMessageType || "text",
          unreadCount: nonNeg(room.unreadCount),
          title: room.title,
        });
      }
    }
    return {
      viewerUserId: prev.viewerUserId,
      rooms: map,
      generation: prev.generation + 1,
    };
  }

  if (event.type === "read") {
    const key = normalizeDomainRoomId(event.roomId);
    if (!key) return prev;
    const map = cloneMap(prev.rooms);
    const cur = map.get(key);
    const domain = requireChatDomain(event.chatDomain) as ChatDomain;
    if (!cur) {
      upsertRoom(map, {
        roomId: event.roomId.trim(),
        chatDomain: domain,
        domainIdentityKey: event.domainIdentityKey.trim(),
        previewText: "",
        lastMessageAt: "",
        lastMessageType: "text",
        unreadCount: 0,
      });
    } else if (nonNeg(cur.unreadCount) === 0) {
      return prev;
    } else {
      upsertRoom(map, { ...cur, unreadCount: 0 });
    }
    return {
      viewerUserId: prev.viewerUserId,
      rooms: map,
      generation: prev.generation + 1,
    };
  }

  // message
  const key = normalizeDomainRoomId(event.roomId);
  if (!key) return prev;
  const domain = requireChatDomain(event.chatDomain);
  const map = cloneMap(prev.rooms);
  const cur = map.get(key);
  const incomingAt = sortKey(event.lastMessageAt);
  const existingAt = cur ? sortKey(cur.lastMessageAt) : 0;
  const keepPreview = cur && existingAt > incomingAt;
  const nextUnread = cur
    ? event.boostUnread
      ? nonNeg(cur.unreadCount) + 1
      : nonNeg(cur.unreadCount)
    : event.boostUnread
      ? 1
      : 0;
  upsertRoom(map, {
    roomId: event.roomId.trim(),
    chatDomain: domain,
    domainIdentityKey: event.domainIdentityKey.trim() || cur?.domainIdentityKey || "",
    previewText: keepPreview ? cur!.previewText : event.previewText || cur?.previewText || "",
    lastMessageAt: keepPreview ? cur!.lastMessageAt : event.lastMessageAt || cur?.lastMessageAt || "",
    lastMessageType: keepPreview
      ? cur!.lastMessageType
      : event.lastMessageType || cur?.lastMessageType || "text",
    unreadCount: nextUnread,
    title: event.title ?? cur?.title,
  });
  return {
    viewerUserId: prev.viewerUserId,
    rooms: map,
    generation: prev.generation + 1,
  };
}
