"use client";

import { broadcastMessengerActiveRoomCrossTab } from "@/lib/community-messenger/consistency/messenger-consistency-cross-tab";
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
  patchRoomSummaryInSnapshotCache,
  primeHotRoomSnapshot,
  primeRoomSnapshot,
  seedRoomSnapshotFromSummary,
} from "@/lib/community-messenger/room-snapshot-cache";
import {
  MESSENGER_REALTIME_TRACKED_ROOMS_CAP,
  pruneSeenIncomingMessageIdsByRoom,
  pruneTrackedRoomMaps,
} from "@/lib/community-messenger/stores/messenger-realtime-prune";
import {
  callStubSessionDedupeKeys,
  sessionKeysMatchMessage,
} from "@/lib/community-messenger/call-event-message";
import { cmReceiveBadgeLog } from "@/lib/community-messenger/read/cm-receive-badge-log";
import { cmRtStoreScopeLog } from "@/lib/community-messenger/realtime/cm-rt-store-scope-log";

type IncomingMessageEventInput = {
  viewerUserId?: string | null;
  roomId: string;
  roomSummary?: CommunityMessengerRoomSummary | null;
  message?: CommunityMessengerMessage | null;
  messageRow?: Record<string, unknown> | null;
};

export type MessengerRealtimeState = {
  viewerUserId: string | null;
  messagesByRoomId: Record<string, CommunityMessengerMessage[]>;
  activeRoomId: string | null;
  /** 상대 읽음 커서·방 스냅샷 런타임 전용 (홈 list unread 아님) */
  lastReadByRoomId: Record<string, string | null>;
  seedRoomSnapshot: (snapshot: CommunityMessengerRoomSnapshot | null | undefined) => void;
  setActiveRoomId: (roomId: string | null) => void;
  applyIncomingMessageEvent: (input: IncomingMessageEventInput) => void;
};

const seenIncomingMessageIdsByRoom = new Map<string, Set<string>>();

/** Realtime·DB room_id 와 부트스트랩 room.id 의 UUID 대소문자 차이로 스토어 키가 갈라지지 않게 한다 */
function normalizeRoomId(roomId: string | null | undefined): string {
  return String(roomId ?? "")
    .trim()
    .toLowerCase();
}

export { normalizeRoomId as normalizeMessengerRealtimeRoomId };

function currentDocumentVisibleAndFocused(): boolean {
  if (typeof document === "undefined") return true;
  if (document.visibilityState !== "visible") return false;
  return typeof document.hasFocus !== "function" || document.hasFocus();
}

/** 실제로 커뮤니티 메신저 방 라우트를 보고 있을 때만 “방 안에서 읽는 중” 판정에 사용 */
function messengerRoomRouteRoomIdNormFromPathname(): string | null {
  if (typeof window === "undefined") return null;
  const m = window.location.pathname.match(/\/community-messenger\/rooms\/([^/?#]+)/);
  const seg = m?.[1]?.trim().toLowerCase() ?? "";
  return seg || null;
}

function activeRoomActuallyReadable(roomId: string, activeRoomId: string | null): boolean {
  const routeRoom = messengerRoomRouteRoomIdNormFromPathname();
  if (!routeRoom || routeRoom !== roomId) return false;
  if (activeRoomId !== roomId || !currentDocumentVisibleAndFocused()) return false;
  const position = useMessengerRoomReaderStateStore.getState().getScrollPositionForPolicy(roomId);
  return position === "at-bottom" || position === "near-bottom";
}

function countTrackedRoomKeys(args: {
  messagesByRoomId: Record<string, CommunityMessengerMessage[]>;
  lastReadByRoomId: Record<string, string | null>;
}): number {
  return new Set([...Object.keys(args.messagesByRoomId), ...Object.keys(args.lastReadByRoomId)]).size;
}

function previewMessageType(row: Record<string, unknown> | null | undefined): CommunityMessengerMessage["messageType"] {
  const raw = typeof row?.message_type === "string" ? row.message_type.trim() : "";
  if (raw === "image" || raw === "file" || raw === "system" || raw === "call_stub" || raw === "voice" || raw === "sticker" || raw === "community_post_share") {
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

/** 동일 탭 bus·rAF 배치 중복 적용 차단(마킹 없음) */
export function messengerIncomingMessageAlreadyTracked(roomId: string, messageId: string): boolean {
  if (!messageId) return false;
  const set = seenIncomingMessageIdsByRoom.get(roomId.toLowerCase());
  return Boolean(set?.has(messageId));
}

function mergeMessages(
  prev: CommunityMessengerMessage[],
  nextMessage: CommunityMessengerMessage
): CommunityMessengerMessage[] {
  const callStubKeys = callStubSessionDedupeKeys(nextMessage);
  const incomingIsLocal = String(nextMessage.id ?? "").startsWith("cm-cevt-");
  let skipIncomingCallStub = false;
  const next = prev.filter((item) => {
    if (item.id === nextMessage.id) return false;
    if (callStubKeys.length === 0) return true;
    const existingKeys = callStubSessionDedupeKeys(item);
    if (!existingKeys.some((key) => callStubKeys.includes(key))) return true;
    const existingIsLocal = String(item.id ?? "").startsWith("cm-cevt-");
    if (existingIsLocal || !incomingIsLocal) return false;
    skipIncomingCallStub = true;
    return true;
  });
  if (skipIncomingCallStub) return prev;
  next.push(nextMessage);
  next.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
  });
  return next;
}

function mergeCallStubDuplicates(messages: CommunityMessengerMessage[]): CommunityMessengerMessage[] {
  let changed = false;
  const byKey = new Map<string, CommunityMessengerMessage>();
  const out: CommunityMessengerMessage[] = [];
  for (const message of messages) {
    const keys = callStubSessionDedupeKeys(message);
    if (keys.length === 0) {
      out.push(message);
      continue;
    }
    const existing = keys.map((key) => byKey.get(key)).find(Boolean);
    if (!existing) {
      for (const key of keys) byKey.set(key, message);
      out.push(message);
      continue;
    }
    changed = true;
    const existingIsLocal = String(existing.id ?? "").startsWith("cm-cevt-");
    const incomingIsLocal = String(message.id ?? "").startsWith("cm-cevt-");
    if (existingIsLocal && !incomingIsLocal) {
      const idx = out.findIndex((item) => item.id === existing.id);
      if (idx >= 0) out[idx] = message;
      for (const key of keys) byKey.set(key, message);
    }
  }
  return changed ? out : messages;
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

function pruneRuntimeRoomMaps(args: {
  messagesByRoomId: Record<string, CommunityMessengerMessage[]>;
  lastReadByRoomId: Record<string, string | null>;
  activeRoomId: string | null;
}): typeof args {
  if (countTrackedRoomKeys(args) <= MESSENGER_REALTIME_TRACKED_ROOMS_CAP) {
    return args;
  }
  const pruned = pruneTrackedRoomMaps(args);
  const keepIds = new Set<string>([
    ...Object.keys(pruned.messagesByRoomId),
    ...Object.keys(pruned.lastReadByRoomId),
  ]);
  pruneSeenIncomingMessageIdsByRoom(keepIds, seenIncomingMessageIdsByRoom);
  return pruned;
}

export const useMessengerRealtimeStore = create<MessengerRealtimeState>((set, get) => ({
  viewerUserId: null,
  messagesByRoomId: {},
  activeRoomId: null,
  lastReadByRoomId: {},
  seedRoomSnapshot: (snapshot) => {
    const t0 = cmReceiveLatencyNow();
    if (!snapshot) return;
    const rid = normalizeRoomId(snapshot.room.id);
    if (!rid) return;
    set((state) => {
      let messagesByRoomId = {
        ...state.messagesByRoomId,
        [rid]: mergeCallStubDuplicates(snapshot.messages ?? state.messagesByRoomId[rid] ?? []),
      };
      let lastReadByRoomId = {
        ...state.lastReadByRoomId,
        [rid]: snapshot.readReceipt?.lastReadMessageId ?? state.lastReadByRoomId[rid] ?? null,
      };
      const pr = pruneRuntimeRoomMaps({
        messagesByRoomId,
        lastReadByRoomId,
        activeRoomId: state.activeRoomId,
      });
      messagesByRoomId = pr.messagesByRoomId;
      lastReadByRoomId = pr.lastReadByRoomId;
      const viewer = snapshot.viewerUserId?.trim() || state.viewerUserId;
      if (viewer) {
        primeRoomSnapshot(rid, snapshot);
        primeHotRoomSnapshot(rid, snapshot);
      }
      return {
        viewerUserId: viewer,
        messagesByRoomId,
        lastReadByRoomId,
        activeRoomId: state.activeRoomId,
      };
    });
    cmRtStoreScopeLog({
      eventType: "seedRoomSnapshot",
      wroteActiveMessages: true,
      wroteRuntimeState: true,
      wroteHomeListBlocked: true,
      activeRoomId: get().activeRoomId,
      durationMs: cmReceiveLatencyNow() - t0,
    });
  },
  setActiveRoomId: (roomId) => {
    const next = normalizeRoomId(roomId) || null;
    set({ activeRoomId: next });
    const viewer = get().viewerUserId?.trim();
    if (viewer) broadcastMessengerActiveRoomCrossTab(viewer, next);
    cmRtStoreScopeLog({
      eventType: "setActiveRoomId",
      wroteRuntimeState: true,
      activeRoomId: next,
    });
  },
  applyIncomingMessageEvent: (input) => {
    const rid = normalizeRoomId(input.roomId);
    if (!rid) return;
    const t0 = cmReceiveLatencyNow();
    const viewerFromInput = input.viewerUserId?.trim() || null;
    let wroteMessages = false;
    set((state) => {
      const tApply0 = cmReceiveLatencyNow();
      const viewer = viewerFromInput || state.viewerUserId;
      const roomSummary = input.roomSummary ?? null;
      const explicitMessage = input.message ?? null;
      const preview = input.messageRow ? listPreviewFromMessengerMessageRow(input.messageRow) : null;
      const fallbackMessage =
        explicitMessage ??
        createPlaceholderMessage({
          roomId: rid,
          viewerUserId: viewer,
          roomSummary,
          messageRow: input.messageRow ?? null,
        });
      const incomingMessageId = String(explicitMessage?.id ?? fallbackMessage?.id ?? "").trim();
      const duplicate = incomingMessageId ? messageIdAlreadyApplied(rid, incomingMessageId) : false;
      if (duplicate) {
        return state;
      }
      const senderId =
        explicitMessage?.senderId ??
        (typeof input.messageRow?.sender_id === "string" ? input.messageRow.sender_id.trim() : null);
      const isMine = Boolean(viewer && senderId && messengerUserIdsEqual(senderId, viewer));
      const routeRoomNorm = messengerRoomRouteRoomIdNormFromPathname();
      const sameRoomReadable = activeRoomActuallyReadable(rid, state.activeRoomId);
      cmReceiveBadgeLog("sender_check", {
        roomId: rid,
        messageId: incomingMessageId || null,
        senderId: senderId ?? null,
        myUserId: viewer ?? null,
        activeRoomId: state.activeRoomId,
        routeRoomId: routeRoomNorm,
        isSelf: isMine,
        isActiveRoom: sameRoomReadable,
        source: "realtime",
        beforeUnread: null,
        afterUnread: null,
      });

      let messagesByRoomId = state.messagesByRoomId;
      if (fallbackMessage != null) {
        wroteMessages = true;
        messagesByRoomId = {
          ...messagesByRoomId,
          [rid]: mergeMessages(messagesByRoomId[rid] ?? [], fallbackMessage),
        };
        const pr = pruneRuntimeRoomMaps({
          messagesByRoomId,
          lastReadByRoomId: state.lastReadByRoomId,
          activeRoomId: state.activeRoomId,
        });
        messagesByRoomId = pr.messagesByRoomId;
      }

      if (roomSummary && viewer && fallbackMessage) {
        seedRoomSnapshotFromSummary({
          room: roomSummary,
          viewerUserId: viewer,
          message: fallbackMessage,
        });
      }
      if (fallbackMessage && viewer) {
        mergeMessageIntoRoomSnapshotCache({
          roomId: rid,
          viewerUserId: viewer,
          roomSummary: roomSummary ?? undefined,
          message: fallbackMessage,
        });
      } else if (roomSummary && viewer && preview) {
        patchRoomSummaryInSnapshotCache({
          roomId: rid,
          viewerUserId: viewer,
          patch: {
            lastMessage: preview.lastMessage,
            lastMessageAt: preview.lastMessageAt,
            lastMessageType: preview.lastMessageType,
          },
        });
      }

      const messageIdForLatency = incomingMessageId || "";
      const latencyKey = cmReceiveLatencyKey({ roomId: rid, messageId: messageIdForLatency || null });
      const tApply1 = cmReceiveLatencyNow();
      cmReceiveLatencyMark(latencyKey, {
        receiver_store_apply_start_ms: tApply0,
        receiver_store_apply_done_ms: tApply1,
      });

      return {
        viewerUserId: viewer ?? state.viewerUserId,
        messagesByRoomId,
        lastReadByRoomId: state.lastReadByRoomId,
        activeRoomId: state.activeRoomId,
      };
    });
    cmRtStoreScopeLog({
      eventType: "applyIncomingMessageEvent",
      wroteActiveMessages: wroteMessages,
      wroteRuntimeState: true,
      wroteHomeListBlocked: true,
      activeRoomId: get().activeRoomId,
      durationMs: cmReceiveLatencyNow() - t0,
    });
  },
}));

/** 부트스트랩에서 viewer id 만 시드 (홈 list 는 React reducer). */
export function seedMessengerRealtimeViewerFromBootstrap(
  bootstrap: CommunityMessengerBootstrap | null | undefined
): void {
  const t0 = cmReceiveLatencyNow();
  const viewer = bootstrap?.me?.id?.trim();
  if (!viewer) return;
  useMessengerRealtimeStore.setState({ viewerUserId: viewer });
  cmRtStoreScopeLog({
    eventType: "seedMessengerRealtimeViewerFromBootstrap",
    wroteRuntimeState: true,
    wroteHomeListBlocked: true,
    activeRoomId: useMessengerRealtimeStore.getState().activeRoomId,
    durationMs: cmReceiveLatencyNow() - t0,
  });
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

/** `samarket-runtime-debug` — `window.peekMessengerRealtimeStoreDebugSnapshot` */
export function peekMessengerRealtimeStoreDebugSnapshot(): {
  messagesByRoomIds: number;
  lastReadKeys: number;
  activeRoomId: string | null;
  viewerUserId: string | null;
  incomingDedupeRooms: number;
} {
  const s = useMessengerRealtimeStore.getState();
  return {
    messagesByRoomIds: Object.keys(s.messagesByRoomId).length,
    lastReadKeys: Object.keys(s.lastReadByRoomId).length,
    activeRoomId: s.activeRoomId,
    viewerUserId: s.viewerUserId,
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

/** 로그아웃·계정 전환 — Realtime 메시지·active room 런타임 초기화 */
export function resetMessengerRealtimeStore(): void {
  seenIncomingMessageIdsByRoom.clear();
  useMessengerRealtimeStore.setState({
    viewerUserId: null,
    messagesByRoomId: {},
    activeRoomId: null,
    lastReadByRoomId: {},
  });
}
