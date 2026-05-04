"use client";

import { create } from "zustand";
import type {
  CommunityMessengerBootstrap,
  CommunityMessengerCallKind,
  CommunityMessengerCallStatus,
  CommunityMessengerMessage,
  CommunityMessengerRoomSnapshot,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import { listPreviewFromMessengerMessageRow } from "@/lib/community-messenger/home/patch-bootstrap-room-list-from-realtime-message";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import {
  cmReceiveLatencyKey,
  cmReceiveLatencyMark,
  cmReceiveLatencyNow,
} from "@/lib/community-messenger/monitoring/cm-receive-latency";
import {
  mergeMessageIntoRoomSnapshotCache,
  patchRoomReadStateInSnapshotCache,
  patchRoomSummaryInSnapshotCache,
  seedRoomSnapshotFromSummary,
} from "@/lib/community-messenger/room-snapshot-cache";
import { applyCommunityMessengerUnreadOptimistic } from "@/lib/chats/owner-hub-badge-store";
import {
  MESSENGER_REALTIME_TRACKED_ROOMS_CAP,
  pruneSeenIncomingMessageIdsByRoom,
  pruneTrackedRoomMaps,
} from "@/lib/community-messenger/stores/messenger-realtime-prune";
import { sessionKeysMatchMessage } from "@/lib/community-messenger/call-event-message";

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

function currentDocumentVisibleAndFocused(): boolean {
  if (typeof document === "undefined") return true;
  if (document.visibilityState !== "visible") return false;
  return typeof document.hasFocus !== "function" || document.hasFocus();
}

function activeRoomActuallyReadable(roomId: string, activeRoomId: string | null): boolean {
  if (activeRoomId !== roomId || !currentDocumentVisibleAndFocused()) return false;
  const position = useMessengerRoomReaderStateStore.getState().getScrollPositionForPolicy(roomId);
  return position === "at-bottom" || position === "near-bottom";
}

function sortRoomOrder(roomSummariesById: Record<string, CommunityMessengerRoomSummary>): string[] {
  return Object.values(roomSummariesById)
    .sort((a, b) => String(b.lastMessageAt ?? "").localeCompare(String(a.lastMessageAt ?? "")))
    .map((room) => room.id);
}

/** `sortRoomOrder` 기준 키 — 이 값이 안 바뀌면 목록 순서 재계산 불필요 */
function feedOrderKey(summary: CommunityMessengerRoomSummary | null | undefined): string {
  return String(summary?.lastMessageAt ?? "");
}

function countTrackedRoomUnionKeys(args: {
  roomSummariesById: Record<string, CommunityMessengerRoomSummary>;
  unreadByRoomId: Record<string, number>;
  messagesByRoomId: Record<string, CommunityMessengerMessage[]>;
}): number {
  return new Set([
    ...Object.keys(args.roomSummariesById),
    ...Object.keys(args.unreadByRoomId),
    ...Object.keys(args.messagesByRoomId),
  ]).size;
}

function maybePruneWhenOverCap(args: {
  roomSummariesById: Record<string, CommunityMessengerRoomSummary>;
  unreadByRoomId: Record<string, number>;
  lastReadByRoomId: Record<string, string | null>;
  messagesByRoomId: Record<string, CommunityMessengerMessage[]>;
  activeRoomId: string | null;
}): typeof args {
  if (countTrackedRoomUnionKeys(args) <= MESSENGER_REALTIME_TRACKED_ROOMS_CAP) return args;
  const pruned = pruneTrackedRoomMaps(args);
  const keepIds = new Set<string>([
    ...Object.keys(pruned.roomSummariesById),
    ...Object.keys(pruned.unreadByRoomId),
    ...Object.keys(pruned.messagesByRoomId),
  ]);
  pruneSeenIncomingMessageIdsByRoom(keepIds, seenIncomingMessageIdsByRoom);
  return pruned;
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

function trimMeta(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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
  const mt = previewMessageType(row);
  const base: CommunityMessengerMessage = {
    id,
    roomId: args.roomId,
    senderId,
    senderLabel: isMine ? "나" : room?.roomType === "direct" ? room.title : "새 메시지",
    messageType: mt,
    content: typeof row.content === "string" ? row.content : "",
    createdAt,
    isMine,
  };
  if (mt === "call_stub") {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    const ckRaw = trimMeta(meta.callKind);
    const ck: CommunityMessengerCallKind | null =
      ckRaw === "video" || ckRaw === "voice" ? ckRaw : null;
    const csRaw = trimMeta(meta.callStatus);
    const cs = (csRaw || null) as CommunityMessengerCallStatus | null;
    return {
      ...base,
      messageType: "call_stub",
      callKind: ck,
      callStatus: cs,
      callSessionId: trimMeta(meta.sessionId) || null,
      callTmpSessionId: trimMeta(meta.tmpSessionId) || null,
    };
  }
  return base;
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
      let roomSummariesById = { ...state.roomSummariesById, ...nextSummaries };
      let unreadByRoomId = { ...state.unreadByRoomId, ...nextUnreadByRoomId };
      let messagesByRoomId = state.messagesByRoomId;
      let lastReadByRoomId = state.lastReadByRoomId;
      const pr = maybePruneWhenOverCap({
        roomSummariesById,
        unreadByRoomId,
        lastReadByRoomId,
        messagesByRoomId,
        activeRoomId: state.activeRoomId,
      });
      roomSummariesById = pr.roomSummariesById;
      unreadByRoomId = pr.unreadByRoomId;
      messagesByRoomId = pr.messagesByRoomId;
      lastReadByRoomId = pr.lastReadByRoomId;
      const totalUnread = recomputeTotalUnread(unreadByRoomId);
      applyCommunityMessengerUnreadOptimistic(totalUnread);
      return {
        viewerUserId: bootstrap.me?.id?.trim() || state.viewerUserId,
        roomSummariesById,
        roomOrder: sortRoomOrder(roomSummariesById),
        messagesByRoomId,
        lastReadByRoomId,
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
      let roomSummariesById = { ...state.roomSummariesById, [rid]: snapshot.room };
      let messagesByRoomId = {
        ...state.messagesByRoomId,
        [rid]: snapshot.messages ?? state.messagesByRoomId[rid] ?? [],
      };
      let unreadByRoomId = {
        ...state.unreadByRoomId,
        [rid]: Math.max(0, Math.floor(Number(snapshot.room.unreadCount) || 0)),
      };
      let lastReadByRoomId = {
        ...state.lastReadByRoomId,
        [rid]: snapshot.readReceipt?.lastReadMessageId ?? state.lastReadByRoomId[rid] ?? null,
      };
      const pr = maybePruneWhenOverCap({
        roomSummariesById,
        unreadByRoomId,
        lastReadByRoomId,
        messagesByRoomId,
        activeRoomId: state.activeRoomId,
      });
      roomSummariesById = pr.roomSummariesById;
      messagesByRoomId = pr.messagesByRoomId;
      unreadByRoomId = pr.unreadByRoomId;
      lastReadByRoomId = pr.lastReadByRoomId;
      const totalUnread = recomputeTotalUnread(unreadByRoomId);
      applyCommunityMessengerUnreadOptimistic(totalUnread);
      return {
        viewerUserId: snapshot.viewerUserId?.trim() || state.viewerUserId,
        roomSummariesById,
        roomOrder: sortRoomOrder(roomSummariesById),
        messagesByRoomId,
        unreadByRoomId,
        totalUnread,
        lastReadByRoomId,
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
      const tApply0 = cmReceiveLatencyNow();
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
      const sameRoomReadable = activeRoomActuallyReadable(rid, state.activeRoomId);
      const shouldIncrementUnread = !duplicate && !isMine && !sameRoomReadable;
      const baseUnread = Math.max(
        0,
        Number(currentSummary?.unreadCount ?? state.unreadByRoomId[rid] ?? 0) || 0
      );
      const nextUnread = shouldIncrementUnread ? baseUnread + 1 : baseUnread;

      const patchedSummary = currentSummary
        ? patchSummaryFromPreview(currentSummary, preview, nextUnread)
        : null;
      const roomSummariesById = patchedSummary
        ? { ...state.roomSummariesById, [rid]: patchedSummary }
        : state.roomSummariesById;
      const unreadByRoomId = { ...state.unreadByRoomId, [rid]: nextUnread };
      const needsRoomReorder =
        Boolean(patchedSummary) && feedOrderKey(currentSummary) !== feedOrderKey(patchedSummary);
      const roomOrder = needsRoomReorder ? sortRoomOrder(roomSummariesById) : state.roomOrder;
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

      const messageIdForLatency = incomingMessageId || "";
      const latencyKey = cmReceiveLatencyKey({ roomId: rid, messageId: messageIdForLatency || null });
      const tApply1 = cmReceiveLatencyNow();
      cmReceiveLatencyMark(latencyKey, {
        receiver_store_apply_start_ms: tApply0,
        receiver_store_apply_done_ms: tApply1,
        unread_delta_applied_ms: tApply1,
        bottom_badge_updated_ms: tApply1,
        ...(patchedSummary ? { room_list_row_updated_ms: tApply1 } : null),
      });

      return {
        viewerUserId: viewer,
        roomSummariesById,
        roomOrder,
        messagesByRoomId,
        unreadByRoomId,
        totalUnread,
        lastReadByRoomId: state.lastReadByRoomId,
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
      const needsRoomReorder = feedOrderKey(current) !== feedOrderKey(next);
      const roomOrder = needsRoomReorder ? sortRoomOrder(roomSummariesById) : state.roomOrder;
      const totalUnread = recomputeTotalUnread(unreadByRoomId);
      if (viewer) {
        patchRoomSummaryInSnapshotCache({
          roomId: rid,
          viewerUserId: viewer,
          patch: next,
        });
      }
      applyCommunityMessengerUnreadOptimistic(totalUnread);
      return {
        viewerUserId: viewer,
        roomSummariesById,
        roomOrder,
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
        });
      }
      applyCommunityMessengerUnreadOptimistic(totalUnread);
      return {
        viewerUserId: viewer,
        roomSummariesById,
        unreadByRoomId,
        totalUnread,
        /**
         * `lastReadByRoomId` 는 **상대** 읽음 커서(`seedRoomSnapshot`·readReceipt) 전용.
         * 내 `mark_read` 꼬리 id 를 넣으면 상대 읽음 표시·스토어가 뒤틀린다.
         */
        lastReadByRoomId: state.lastReadByRoomId,
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

/**
 * 터미널 이벤트 직전 — 같은 세션의 링 스텁(`dialing`/`incoming`)만 제거해 최종 한 줄로 치환된다.
 */
export function removeRingingCallStubsForSessionKeys(input: {
  roomId: string;
  sessionId?: string | null;
  tmpSessionId?: string | null;
}): void {
  const rid = normalizeRoomId(input.roomId);
  if (!rid) return;
  useMessengerRealtimeStore.setState((state) => {
    const list = state.messagesByRoomId[rid] ?? [];
    const next = list.filter((m) => {
      if (m.messageType !== "call_stub") return true;
      if (!sessionKeysMatchMessage(input.sessionId, input.tmpSessionId, m.callSessionId, m.callTmpSessionId ?? null)) {
        return true;
      }
      const st = m.callStatus;
      return st !== "dialing" && st !== "incoming";
    });
    if (next.length === list.length) return state;
    return { ...state, messagesByRoomId: { ...state.messagesByRoomId, [rid]: next } };
  });
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
