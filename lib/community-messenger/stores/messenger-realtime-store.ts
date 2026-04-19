"use client";

import { create } from "zustand";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerMessage,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { listPreviewFromMessengerMessageRow } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  mergeMessageIntoRoomSnapshotCache,
  patchRoomReadStateInSnapshotCache,
  patchRoomSummaryInSnapshotCache,
  seedRoomSnapshotFromSummary,
} from "@/lib/community-messenger/room-snapshot-cache";
import { applyCommunityMessengerUnreadOptimistic } from "@/lib/chats/owner-hub-badge-store";

type IncomingMessageEventInput = {
  viewerUserId?: string | null;
  roomId: string;
  roomSummary?: CommunityMessengerRoomSummary | null;
  message?: CommunityMessengerMessage | null;
  messageRow?: Record<string, unknown> | null;
};

type RoomSummaryPatchedInput = {
  viewerUserId?: string | null;
  roomId: string;
  unreadCount?: number | null;
  lastReadMessageId?: string | null;
  summaryPatch?: Partial<
    Pick<
      CommunityMessengerRoomSummary,
      "lastMessage" | "lastMessageAt" | "lastMessageType" | "unreadCount" | "isMuted" | "isPinned"
    >
  > | null;
};

type RoomReadEventInput = {
  viewerUserId?: string | null;
  roomId: string;
  lastReadMessageId?: string | null;
};

type MessengerRealtimeState = {
  viewerUserId: string | null;
  roomSummariesById: Record<string, CommunityMessengerRoomSummary>;
  roomOrder: string[];
  messagesByRoomId: Record<string, CommunityMessengerMessage[]>;
  unreadByRoomId: Record<string, number>;
  activeRoomId: string | null;
  totalUnread: number;
  lastReadByRoomId: Record<string, string | null>;
  seedBootstrap: (bootstrap: CommunityMessengerBootstrap | null | undefined) => void;
  seedRoomSnapshot: (snapshot: CommunityMessengerRoomSnapshot | null | undefined) => void;
  setActiveRoomId: (roomId: string | null) => void;
  applyIncomingMessageEvent: (input: IncomingMessageEventInput) => void;
  applyRoomSummaryPatched: (input: RoomSummaryPatchedInput) => void;
  applyRoomReadEvent: (input: RoomReadEventInput) => void;
};

const seenIncomingMessageIdsByRoom = new Map<string, Set<string>>();

function normalizeRoomId(roomId: string | null | undefined): string {
  return String(roomId ?? "").trim();
}

function visibleFocused(): boolean {
  if (typeof document === "undefined") return true;
  return document.visibilityState === "visible" && (typeof document.hasFocus !== "function" || document.hasFocus());
}

function sortRoomOrder(roomSummariesById: Record<string, CommunityMessengerRoomSummary>): string[] {
  return Object.values(roomSummariesById)
    .sort((a, b) => String(b.lastMessageAt ?? "").localeCompare(String(a.lastMessageAt ?? "")))
    .map((room) => room.id);
}

function recomputeTotalUnread(unreadByRoomId: Record<string, number>): number {
  return Object.values(unreadByRoomId).reduce((sum, unread) => {
    return sum + (Math.max(0, Math.floor(Number(unread) || 0)) > 0 ? 1 : 0);
  }, 0);
}

function previewMessageType(row: Record<string, unknown> | null | undefined): CommunityMessengerMessage["messageType"] {
  const raw = typeof row?.message_type === "string" ? row.message_type.trim() : "";
  if (raw === "image" || raw === "file" || raw === "system" || raw === "call_stub" || raw === "voice" || raw === "sticker") {
    return raw;
  }
  return "text";
}

function messageIdAlreadyApplied(roomId: string, messageId: string): boolean {
  if (!messageId) return false;
  const key = roomId.toLowerCase();
  let set = seenIncomingMessageIdsByRoom.get(key);
  if (!set) {
    set = new Set<string>();
    seenIncomingMessageIdsByRoom.set(key, set);
  }
  if (set.has(messageId)) return true;
  set.add(messageId);
  if (set.size > 80) {
    const keep = [...set].slice(-40);
    seenIncomingMessageIdsByRoom.set(key, new Set(keep));
  }
  return false;
}

function mergeMessages(
  prev: CommunityMessengerMessage[],
  nextMessage: CommunityMessengerMessage
): CommunityMessengerMessage[] {
  const next = prev.filter((item) => item.id !== nextMessage.id);
  next.push(nextMessage);
  next.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return next;
}

function createPlaceholderMessage(args: {
  roomId: string;
  viewerUserId: string | null;
  roomSummary: CommunityMessengerRoomSummary | null;
  messageRow?: Record<string, unknown> | null;
}): CommunityMessengerMessage | null {
  const row = args.messageRow ?? null;
  if (!row) return null;
  const room = args.roomSummary;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const createdAt = typeof row.created_at === "string" ? row.created_at.trim() : "";
  if (!id || !createdAt) return null;
  const senderId = typeof row.sender_id === "string" ? row.sender_id.trim() : null;
  const viewer = args.viewerUserId?.trim() || null;
  const isMine = Boolean(viewer && senderId && messengerUserIdsEqual(senderId, viewer));
  return {
    id,
    roomId: args.roomId,
    senderId,
    senderLabel: isMine ? "나" : room?.roomType === "direct" ? room.title : "새 메시지",
    messageType: previewMessageType(row),
    content: typeof row.content === "string" ? row.content : "",
    createdAt,
    isMine,
  };
}

function patchSummaryFromPreview(
  summary: CommunityMessengerRoomSummary,
  preview: ReturnType<typeof listPreviewFromMessengerMessageRow> | null,
  unreadCount: number
): CommunityMessengerRoomSummary {
  return {
    ...summary,
    ...(preview
      ? {
          lastMessage: preview.lastMessage,
          lastMessageAt: preview.lastMessageAt,
          lastMessageType: preview.lastMessageType,
        }
      : null),
    unreadCount,
  };
}

export const useMessengerRealtimeStore = create<MessengerRealtimeState>((set, get) => ({
  viewerUserId: null,
  roomSummariesById: {},
  roomOrder: [],
  messagesByRoomId: {},
  unreadByRoomId: {},
  activeRoomId: null,
  totalUnread: 0,
  lastReadByRoomId: {},
  seedBootstrap: (bootstrap) => {
    if (!bootstrap) return;
    const nextSummaries: Record<string, CommunityMessengerRoomSummary> = {};
    const nextUnreadByRoomId: Record<string, number> = {};
    for (const room of [...(bootstrap.chats ?? []), ...(bootstrap.groups ?? [])]) {
      nextSummaries[room.id] = room;
      nextUnreadByRoomId[room.id] = Math.max(0, Math.floor(Number(room.unreadCount) || 0));
    }
    set((state) => {
      const merged = { ...state.roomSummariesById, ...nextSummaries };
      const unreadByRoomId = { ...state.unreadByRoomId, ...nextUnreadByRoomId };
      const totalUnread = recomputeTotalUnread(unreadByRoomId);
      applyCommunityMessengerUnreadOptimistic(totalUnread);
      return {
        viewerUserId: bootstrap.me?.id?.trim() || state.viewerUserId,
        roomSummariesById: merged,
        roomOrder: sortRoomOrder(merged),
        unreadByRoomId,
        totalUnread,
      };
    });
  },
  seedRoomSnapshot: (snapshot) => {
    if (!snapshot) return;
    const rid = normalizeRoomId(snapshot.room.id);
    if (!rid) return;
    set((state) => {
      const roomSummariesById = { ...state.roomSummariesById, [rid]: snapshot.room };
      const messagesByRoomId = {
        ...state.messagesByRoomId,
        [rid]: snapshot.messages ?? state.messagesByRoomId[rid] ?? [],
      };
      const unreadByRoomId = {
        ...state.unreadByRoomId,
        [rid]: Math.max(0, Math.floor(Number(snapshot.room.unreadCount) || 0)),
      };
      const totalUnread = recomputeTotalUnread(unreadByRoomId);
      applyCommunityMessengerUnreadOptimistic(totalUnread);
      return {
        viewerUserId: snapshot.viewerUserId?.trim() || state.viewerUserId,
        roomSummariesById,
        roomOrder: sortRoomOrder(roomSummariesById),
        messagesByRoomId,
        unreadByRoomId,
        totalUnread,
        lastReadByRoomId: {
          ...state.lastReadByRoomId,
          [rid]: snapshot.readReceipt?.lastReadMessageId ?? state.lastReadByRoomId[rid] ?? null,
        },
      };
    });
  },
  setActiveRoomId: (roomId) => {
    set({ activeRoomId: normalizeRoomId(roomId) || null });
  },
  applyIncomingMessageEvent: (input) => {
    const rid = normalizeRoomId(input.roomId);
    if (!rid) return;
    const viewerFromInput = input.viewerUserId?.trim() || null;
    set((state) => {
      const viewer = viewerFromInput || state.viewerUserId;
      const currentSummary = input.roomSummary ?? state.roomSummariesById[rid] ?? null;
      const explicitMessage = input.message ?? null;
      const preview = input.messageRow ? listPreviewFromMessengerMessageRow(input.messageRow) : null;
      const fallbackMessage =
        explicitMessage ??
        createPlaceholderMessage({
          roomId: rid,
          viewerUserId: viewer,
          roomSummary: currentSummary,
          messageRow: input.messageRow ?? null,
        });
      const incomingMessageId = String(explicitMessage?.id ?? fallbackMessage?.id ?? "").trim();
      const duplicate = incomingMessageId ? messageIdAlreadyApplied(rid, incomingMessageId) : false;
      const senderId =
        explicitMessage?.senderId ??
        (typeof input.messageRow?.sender_id === "string" ? input.messageRow.sender_id.trim() : null);
      const isMine = Boolean(viewer && senderId && messengerUserIdsEqual(senderId, viewer));
      const sameRoomVisible = state.activeRoomId === rid && visibleFocused();
      const shouldIncrementUnread = !duplicate && !isMine && !sameRoomVisible;
      const baseUnread = Math.max(
        0,
        Number(currentSummary?.unreadCount ?? state.unreadByRoomId[rid] ?? 0) || 0
      );
      const nextUnread = shouldIncrementUnread ? baseUnread + 1 : baseUnread;

      const roomSummariesById = currentSummary
        ? {
            ...state.roomSummariesById,
            [rid]: patchSummaryFromPreview(currentSummary, preview, nextUnread),
          }
        : state.roomSummariesById;
      const unreadByRoomId = { ...state.unreadByRoomId, [rid]: nextUnread };
      const roomOrder = roomSummariesById === state.roomSummariesById ? state.roomOrder : sortRoomOrder(roomSummariesById);
      const messagesByRoomId =
        fallbackMessage == null
          ? state.messagesByRoomId
          : {
              ...state.messagesByRoomId,
              [rid]: mergeMessages(state.messagesByRoomId[rid] ?? [], fallbackMessage),
            };
      const totalUnread = recomputeTotalUnread(unreadByRoomId);

      if (currentSummary && viewer) {
        seedRoomSnapshotFromSummary({
          room: roomSummariesById[rid] ?? currentSummary,
          viewerUserId: viewer,
          message: fallbackMessage,
        });
      }
      if (fallbackMessage && viewer) {
        mergeMessageIntoRoomSnapshotCache({
          roomId: rid,
          viewerUserId: viewer,
          roomSummary: roomSummariesById[rid] ?? currentSummary ?? undefined,
          message: fallbackMessage,
        });
      } else if (currentSummary && viewer && preview) {
        patchRoomSummaryInSnapshotCache({
          roomId: rid,
          viewerUserId: viewer,
          patch: {
            lastMessage: preview.lastMessage,
            lastMessageAt: preview.lastMessageAt,
            lastMessageType: preview.lastMessageType,
            unreadCount: nextUnread,
          },
        });
      }
      applyCommunityMessengerUnreadOptimistic(totalUnread);

      return {
        viewerUserId: viewer,
        roomSummariesById,
        roomOrder,
        messagesByRoomId,
        unreadByRoomId,
        totalUnread,
        lastReadByRoomId:
          sameRoomVisible && incomingMessageId
            ? { ...state.lastReadByRoomId, [rid]: incomingMessageId }
            : state.lastReadByRoomId,
      };
    });
  },
  applyRoomSummaryPatched: (input) => {
    const rid = normalizeRoomId(input.roomId);
    if (!rid) return;
    const viewerFromInput = input.viewerUserId?.trim() || null;
    set((state) => {
      const viewer = viewerFromInput || state.viewerUserId;
      const current = state.roomSummariesById[rid];
      const nextUnread =
        typeof input.unreadCount === "number" && Number.isFinite(input.unreadCount)
          ? Math.max(0, Math.floor(input.unreadCount))
          : Math.max(0, Math.floor(Number(state.unreadByRoomId[rid] ?? current?.unreadCount ?? 0) || 0));
      if (!current) {
        const unreadByRoomId = { ...state.unreadByRoomId, [rid]: nextUnread };
        const totalUnread = recomputeTotalUnread(unreadByRoomId);
        applyCommunityMessengerUnreadOptimistic(totalUnread);
        return {
          ...state,
          viewerUserId: viewer,
          unreadByRoomId,
          totalUnread,
          lastReadByRoomId:
            input.lastReadMessageId !== undefined
              ? { ...state.lastReadByRoomId, [rid]: input.lastReadMessageId ?? null }
              : state.lastReadByRoomId,
        };
      }
      const next = {
        ...current,
        ...(input.summaryPatch ?? null),
        ...(typeof input.unreadCount === "number" && Number.isFinite(input.unreadCount) ? { unreadCount: nextUnread } : null),
      };
      const roomSummariesById = { ...state.roomSummariesById, [rid]: next };
      const unreadByRoomId = { ...state.unreadByRoomId, [rid]: nextUnread };
      const totalUnread = recomputeTotalUnread(unreadByRoomId);
      if (viewer) {
        patchRoomSummaryInSnapshotCache({
          roomId: rid,
          viewerUserId: viewer,
          patch: next,
        });
        if ((input.unreadCount ?? null) === 0) {
          patchRoomReadStateInSnapshotCache({
            roomId: rid,
            viewerUserId: viewer,
            unreadCount: 0,
            lastReadMessageId: input.lastReadMessageId ?? null,
          });
        }
      }
      applyCommunityMessengerUnreadOptimistic(totalUnread);
      return {
        viewerUserId: viewer,
        roomSummariesById,
        roomOrder: sortRoomOrder(roomSummariesById),
        unreadByRoomId,
        totalUnread,
        lastReadByRoomId:
          input.lastReadMessageId !== undefined
            ? { ...state.lastReadByRoomId, [rid]: input.lastReadMessageId ?? null }
            : state.lastReadByRoomId,
      };
    });
  },
  applyRoomReadEvent: (input) => {
    const rid = normalizeRoomId(input.roomId);
    if (!rid) return;
    const viewerFromInput = input.viewerUserId?.trim() || null;
    set((state) => {
      const viewer = viewerFromInput || state.viewerUserId;
      const current = state.roomSummariesById[rid];
      const roomSummariesById = current
        ? {
            ...state.roomSummariesById,
            [rid]: { ...current, unreadCount: 0 },
          }
        : state.roomSummariesById;
      const unreadByRoomId = { ...state.unreadByRoomId, [rid]: 0 };
      const totalUnread = recomputeTotalUnread(unreadByRoomId);
      if (viewer) {
        patchRoomReadStateInSnapshotCache({
          roomId: rid,
          viewerUserId: viewer,
          unreadCount: 0,
          lastReadMessageId: input.lastReadMessageId ?? null,
        });
      }
      applyCommunityMessengerUnreadOptimistic(totalUnread);
      return {
        viewerUserId: viewer,
        roomSummariesById,
        unreadByRoomId,
        totalUnread,
        lastReadByRoomId: {
          ...state.lastReadByRoomId,
          [rid]: input.lastReadMessageId ?? null,
        },
      };
    });
  },
}));

export function seedMessengerRealtimeFromBootstrap(bootstrap: CommunityMessengerBootstrap | null | undefined): void {
  useMessengerRealtimeStore.getState().seedBootstrap(bootstrap);
}

export function seedMessengerRealtimeFromRoomSnapshot(snapshot: CommunityMessengerRoomSnapshot | null | undefined): void {
  useMessengerRealtimeStore.getState().seedRoomSnapshot(snapshot);
}

export function setActiveMessengerRealtimeRoom(roomId: string | null): void {
  useMessengerRealtimeStore.getState().setActiveRoomId(roomId);
}

export function applyIncomingMessageEvent(input: IncomingMessageEventInput): void {
  useMessengerRealtimeStore.getState().applyIncomingMessageEvent(input);
}

export function applyRoomSummaryPatched(input: RoomSummaryPatchedInput): void {
  useMessengerRealtimeStore.getState().applyRoomSummaryPatched(input);
}

export function applyRoomReadEvent(input: RoomReadEventInput): void {
  useMessengerRealtimeStore.getState().applyRoomReadEvent(input);
}

export function getMessengerRealtimeRoomSummary(roomId: string): CommunityMessengerRoomSummary | null {
  return useMessengerRealtimeStore.getState().roomSummariesById[normalizeRoomId(roomId)] ?? null;
}

export function getMessengerRealtimeRoomMessages(roomId: string): CommunityMessengerMessage[] {
  return useMessengerRealtimeStore.getState().messagesByRoomId[normalizeRoomId(roomId)] ?? [];
}

export function primeMessengerRoomEntrySnapshot(args: {
  viewerUserId: string | null | undefined;
  room: CommunityMessengerRoomSummary;
}): void {
  const viewerUserId = args.viewerUserId?.trim() || "";
  if (!viewerUserId) return;
  const messages = getMessengerRealtimeRoomMessages(args.room.id);
  const latest = messages[messages.length - 1] ?? null;
  seedRoomSnapshotFromSummary({
    room: args.room,
    viewerUserId,
    message: latest,
  });
}

/** `samarket-runtime-debug` 와 순환 금지 — `window.peekMessengerRealtimeStoreDebugSnapshot` 으로만 노출 */
export function peekMessengerRealtimeStoreDebugSnapshot(): {
  roomSummariesCount: number;
  roomOrderLength: number;
  messagesByRoomIds: number;
  unreadKeys: number;
  totalUnread: number;
  incomingDedupeRooms: number;
} {
  const s = useMessengerRealtimeStore.getState();
  return {
    roomSummariesCount: Object.keys(s.roomSummariesById).length,
    roomOrderLength: s.roomOrder.length,
    messagesByRoomIds: Object.keys(s.messagesByRoomId).length,
    unreadKeys: Object.keys(s.unreadByRoomId).length,
    totalUnread: s.totalUnread,
    incomingDedupeRooms: seenIncomingMessageIdsByRoom.size,
  };
}

if (typeof window !== "undefined") {
  queueMicrotask(() => {
    try {
      if (sessionStorage.getItem("samarket:debug:runtime") === "1") {
        (window as unknown as { peekMessengerRealtimeStoreDebugSnapshot?: typeof peekMessengerRealtimeStoreDebugSnapshot }).peekMessengerRealtimeStoreDebugSnapshot =
          peekMessengerRealtimeStoreDebugSnapshot;
      }
    } catch {
      /* ignore */
    }
  });
}
