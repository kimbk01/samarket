"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import type { CommunityMessengerMessage, CommunityMessengerProfileLite, CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import {
  communityMessengerBumpKnownRoomIds,
  communityMessengerBumpPayloadMatchesKnownRooms,
  communityMessengerRoomBumpChannelName,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import { parseCommunityMessengerBumpMessageSnapshot } from "@/lib/community-messenger/realtime/community-messenger-room-bump-message-snapshot";
import { resolveRoomBumpDedupeKey } from "@/lib/chat-domain/realtime/domain-realtime-envelope";
import { isUuidLikeString } from "@/lib/shared/uuid-string";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeCommunityMessengerRoomBumpBroadcast } from "@/lib/community-messenger/realtime/room-bump-broadcast";
import {
  removeCmRtChannelTracked,
  runAfterCmRtTopicRemoval,
} from "@/lib/community-messenger/realtime/cm-rt-channel-registry";
import { notifyMessengerRoomRealtimeResumed } from "@/lib/community-messenger/room/use-messenger-room-visibility-bus-catchup";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";
import { resolveOwnRoomBumpDecision } from "@/lib/community-messenger/room/own-room-bump-origin-policy";

type RoomBumpListener = {
  onBump: (payload: Record<string, unknown>) => void;
};

type RoomBumpRoomEntry = {
  roomId: string;
  listeners: Set<MutableRefObject<RoomBumpListener>>;
  stop: () => void;
  /** 0 이 된 뒤 같은 tick 에 다시 acquire 되면(방 id 집합 변경) 채널을 유지한다 — remove→create 경합 제거 */
  releaseTimer: ReturnType<typeof setTimeout> | null;
};

/** 방(uuid) 단위 refcount — 같은 토픽 채널은 탭 안에서 1개. */
const roomBumpEntries = new Map<string, RoomBumpRoomEntry>();

/**
 * 첫 SUBSCRIBED 는 bind, 이후 SUBSCRIBED 는 재합류 — I-2 복귀 정합 1회 요청.
 * (재합류 사이에 서버가 보낸 bump 는 broadcast 특성상 재전송되지 않는다.)
 */
export function createRoomBumpResubscribeStatusTracker(roomId: string, onResubscribed: (roomId: string) => void) {
  let subscribedOnce = false;
  return (status: string) => {
    if (status !== "SUBSCRIBED") return;
    if (!subscribedOnce) {
      subscribedOnce = true;
      return;
    }
    onResubscribed(roomId);
  };
}

function createRoomBumpRoomEntry(viewer: string, roomId: string): RoomBumpRoomEntry {
  const key = `${viewer}\0${roomId}`;
  const entry: RoomBumpRoomEntry = {
    roomId,
    listeners: new Set(),
    stop: () => undefined,
    releaseTimer: null,
  };
  const sb = getSupabaseClient();
  if (!sb) return entry;
  const channelName = communityMessengerRoomBumpChannelName(roomId);
  let stopped = false;
  let channel: ReturnType<typeof subscribeCommunityMessengerRoomBumpBroadcast> | null = null;
  /** M-5: 같은 토픽 remove 가 끝나기 전에 새 채널을 만들지 않는다. */
  runAfterCmRtTopicRemoval(channelName, () => {
    if (stopped) return;
    channel = subscribeCommunityMessengerRoomBumpBroadcast({
      sb,
      roomId,
      onBump: (payload) => {
        for (const listener of entry.listeners) {
          listener.current.onBump(payload);
        }
      },
      onStatus: createRoomBumpResubscribeStatusTracker(roomId, (rid) =>
        notifyMessengerRoomRealtimeResumed(rid, "resubscribed")
      ),
    });
  });
  entry.stop = () => {
    stopped = true;
    if (roomBumpEntries.get(key) === entry) roomBumpEntries.delete(key);
    if (channel) void removeCmRtChannelTracked(sb, channel, channelName);
    channel = null;
  };
  return entry;
}

function acquireRoomBumpListener(
  viewer: string,
  roomIds: string[],
  listenerRef: MutableRefObject<RoomBumpListener>
): () => void {
  /**
   * 비공개 토픽 SELECT 권한은 `community_messenger_rooms.id`(uuid) 토픽에만 부여된다.
   * 레거시 비-uuid 라우트 id 구독은 Unauthorized rejoin만 반복하므로 제외한다.
   */
  const ids = [
    ...new Set(roomIds.map((rid) => String(rid ?? "").trim()).filter((rid) => isUuidLikeString(rid))),
  ];
  const held: RoomBumpRoomEntry[] = [];
  for (const rid of ids) {
    const key = `${viewer}\0${rid}`;
    let entry = roomBumpEntries.get(key);
    if (!entry) {
      entry = createRoomBumpRoomEntry(viewer, rid);
      roomBumpEntries.set(key, entry);
    }
    if (entry.releaseTimer != null) {
      clearTimeout(entry.releaseTimer);
      entry.releaseTimer = null;
    }
    entry.listeners.add(listenerRef);
    held.push(entry);
  }
  return () => {
    for (const entry of held) {
      entry.listeners.delete(listenerRef);
      if (entry.listeners.size > 0 || entry.releaseTimer != null) continue;
      entry.releaseTimer = setTimeout(() => {
        entry.releaseTimer = null;
        if (entry.listeners.size === 0) entry.stop();
      }, 0);
    }
  };
}

/** tests */
export function roomBumpRegistryListenerCount(viewer: string, roomId: string): number {
  return roomBumpEntries.get(`${viewer}\0${roomId}`)?.listeners.size ?? 0;
}

type QueuedBump = {
  payload: Record<string, unknown>;
  hint: string;
  ownDecision: ReturnType<typeof resolveOwnRoomBumpDecision>;
};

type BumpCatchUpRequest = {
  /** 이 프레임(또는 180ms 창)에서 정합이 필요한 bump 의 hint — 누적(덮어쓰기 금지) */
  hints: string[];
  /** 스냅샷 병합 없이 온 bump 의 hint(제자리 UPDATE 가능성) — 단건 GET 우선 대상 */
  unmergedHints: string[];
  /** 정합 대상 bump 가 모두 스냅샷 병합됐는가 */
  allMergedSnapshot: boolean;
  bumpCount: number;
};

/**
 * M-3 — 한 프레임에 온 bump 를 **모두** 큐에 담아 한 번에 처리하기 위한 순수 집계(테스트 대상).
 * 정합 hint 는 Set 으로 누적하고, 단건 GET 대상은 스냅샷이 없던 bump 의 마지막 hint 를 우선한다.
 */
export function mergeBumpCatchUpRequests(
  prev: BumpCatchUpRequest | null,
  next: BumpCatchUpRequest
): BumpCatchUpRequest {
  if (!prev) return { ...next, hints: [...new Set(next.hints)], unmergedHints: [...new Set(next.unmergedHints)] };
  return {
    hints: [...new Set([...prev.hints, ...next.hints])],
    unmergedHints: [...new Set([...prev.unmergedHints, ...next.unmergedHints])],
    allMergedSnapshot: prev.allMergedSnapshot && next.allMergedSnapshot,
    bumpCount: prev.bumpCount + next.bumpCount,
  };
}

export function primaryHintOfBumpCatchUpRequest(req: BumpCatchUpRequest): string {
  const unmerged = req.unmergedHints.filter(Boolean);
  if (unmerged.length > 0) return unmerged[unmerged.length - 1]!;
  const all = req.hints.filter(Boolean);
  return all.length > 0 ? all[all.length - 1]! : "";
}

/**
 * 프레임 단위 flush 스케줄 — rAF 를 취소·재예약하지 않는다(앞 bump 유실 금지).
 * 문서가 숨겨져 rAF 가 멈춘 상태면 setTimeout(0) 으로 flush 한다.
 */
export function createRoomBumpFrameQueue<T>(deps: {
  flush: (items: T[]) => void;
  isDocumentHidden?: () => boolean;
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (id: number) => void;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (h: unknown) => void;
  onFrameHandle?: (id: number | null) => void;
}) {
  const isHidden =
    deps.isDocumentHidden ?? (() => typeof document !== "undefined" && document.visibilityState === "hidden");
  const requestFrame = deps.requestFrame ?? ((cb: () => void) => requestAnimationFrame(cb));
  const cancelFrame = deps.cancelFrame ?? ((id: number) => cancelAnimationFrame(id));
  const setTimer = deps.setTimer ?? ((cb: () => void, ms: number) => setTimeout(cb, ms));
  const clearTimer = deps.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let queue: T[] = [];
  let frameId: number | null = null;
  let timer: unknown = null;
  let disposed = false;

  const run = () => {
    if (frameId != null) cancelFrame(frameId);
    frameId = null;
    deps.onFrameHandle?.(null);
    if (timer != null) clearTimer(timer);
    timer = null;
    if (disposed) return;
    const items = queue;
    queue = [];
    if (items.length > 0) deps.flush(items);
  };

  const scheduleHiddenFlush = () => {
    if (timer != null) return;
    timer = setTimer(run, 0);
  };

  return {
    push(item: T) {
      if (disposed) return;
      queue.push(item);
      if (isHidden()) {
        scheduleHiddenFlush();
        return;
      }
      if (frameId != null || timer != null) return;
      frameId = requestFrame(run);
      deps.onFrameHandle?.(frameId);
    },
    /** 문서가 숨겨질 때 — 대기 중 rAF 는 멈추므로 timer 로 넘긴다. */
    onHidden() {
      if (disposed || queue.length === 0) return;
      scheduleHiddenFlush();
    },
    pendingCount: () => queue.length,
    dispose() {
      disposed = true;
      queue = [];
      if (frameId != null) cancelFrame(frameId);
      frameId = null;
      deps.onFrameHandle?.(null);
      if (timer != null) clearTimer(timer);
      timer = null;
    },
  };
}

/**
 * Broadcast v2 bump — postgres_changes 누락 시에도 방 단위로 증분 동기화.
 * M-3: 프레임 단위 큐(앞 bump 유실 금지) · M-5: 방 단위 refcount 채널 + remove 완료 후 재구독 + 원시값 deps.
 */
export function useMessengerRoomBumpBroadcastSubscription({
  roomId,
  streamRoomId,
  roomReadyForRealtime,
  snapshot,
  initialServerSnapshot,
  snapshotRef,
  roomMembersDisplayRef,
  remoteBumpCatchUpRafRef,
  lastRemoteBumpDedupeRef,
  roomMessagesRef,
  setRoomMessages,
  catchUpAfterRemoteBump,
}: {
  roomId: string;
  streamRoomId: string;
  roomReadyForRealtime: boolean;
  snapshot: CommunityMessengerRoomSnapshot | null;
  initialServerSnapshot: CommunityMessengerRoomSnapshot | null;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMembersDisplayRef: MutableRefObject<CommunityMessengerProfileLite[]>;
  remoteBumpCatchUpRafRef: MutableRefObject<number | null>;
  lastRemoteBumpDedupeRef: MutableRefObject<string>;
  /** 이 기기 타임라인(낙관 포함) — 내 bump 스킵 판정용 */
  roomMessagesRef: MutableRefObject<ReadonlyArray<CommunityMessengerMessage & { pending?: boolean }>>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  catchUpAfterRemoteBump: (
    hintMessageId?: string | null,
    opts?: { alreadyMergedSnapshot?: boolean; coalescedBumpCount?: number }
  ) => Promise<void>;
}): void {
  const listenerRef = useRef<RoomBumpListener>({ onBump: () => undefined });
  const catchUpAfterRemoteBumpRef = useRef(catchUpAfterRemoteBump);
  useEffect(() => {
    catchUpAfterRemoteBumpRef.current = catchUpAfterRemoteBump;
  }, [catchUpAfterRemoteBump]);

  /** M-5: deps 는 원시값만 — viewer · 구독 방 id 집합(정렬 문자열). */
  const viewer = snapshot?.viewerUserId?.trim() || initialServerSnapshot?.viewerUserId?.trim() || "";
  const route = String(roomId ?? "").trim();
  const stream = String(streamRoomId ?? "").trim();
  const snapRoom = String(snapshot?.room?.id ?? "").trim();
  const bumpSubscribeIdsKey = [
    ...communityMessengerBumpKnownRoomIds({
      routeRoomId: route,
      streamRoomId: stream || route,
      snapshotRoomId: snapRoom || null,
    }),
  ]
    .sort()
    .join("\n");

  /**
   * `postgres_changes` 가 publication/RLS/세션 타이밍 문제로 누락돼도,
   * 방 단위 Broadcast bump 신호로 즉시 증분 동기화한다.
   */
  useEffect(() => {
    if (!viewer || !roomReadyForRealtime) return;
    const bumpSubscribeIds = bumpSubscribeIdsKey ? bumpSubscribeIdsKey.split("\n") : [];
    if (bumpSubscribeIds.length === 0) return;

    const sb = getSupabaseClient();
    if (!sb) return;
    let lastCatchUpAt = 0;
    let catchUpTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRequest: BumpCatchUpRequest | null = null;
    const fireCatchUp = (req: BumpCatchUpRequest) => {
      lastCatchUpAt = Date.now();
      const h = primaryHintOfBumpCatchUpRequest(req);
      void catchUpAfterRemoteBumpRef.current(h || undefined, {
        alreadyMergedSnapshot: req.allMergedSnapshot,
        coalescedBumpCount: req.bumpCount,
      });
    };
    const scheduleCatchUp = (req: BumpCatchUpRequest) => {
      const elapsed = Date.now() - lastCatchUpAt;
      const minGap = 180;
      pendingRequest = mergeBumpCatchUpRequests(pendingRequest, req);
      if (elapsed < minGap) {
        if (catchUpTimer != null) return;
        catchUpTimer = setTimeout(() => {
          catchUpTimer = null;
          const merged = pendingRequest;
          pendingRequest = null;
          if (merged) fireCatchUp(merged);
        }, minGap - elapsed);
        return;
      }
      if (catchUpTimer != null) {
        clearTimeout(catchUpTimer);
        catchUpTimer = null;
      }
      const merged = pendingRequest;
      pendingRequest = null;
      fireCatchUp(merged);
    };

    /**
     * M-3: 한 프레임에 온 bump 전부를 처리 — 스냅샷은 한 번의 merge 로, 정합 요청은 hint 누적으로.
     */
    const flushBumps = (items: QueuedBump[]) => {
      const enrichedAll: CommunityMessengerMessage[] = [];
      const request: BumpCatchUpRequest = { hints: [], unmergedHints: [], allMergedSnapshot: true, bumpCount: 0 };
      for (const item of items) {
        /**
         * Snapshot acceleration only when parse validates (message.senderId === fromUserId).
         * Peer-mutated rows fail parse by design — canonical GET reconcile is authority.
         */
        const pre = parseCommunityMessengerBumpMessageSnapshot(item.payload, viewer);
        let mergedSnapshot = false;
        let catchUpHint = item.hint;
        if (pre) {
          const member = roomMembersDisplayRef.current.find((m) => messengerUserIdsEqual(m.id, pre.senderId ?? ""));
          const enriched =
            member?.label && member.label.trim().length > 0 ? { ...pre, senderLabel: member.label } : pre;
          enrichedAll.push(enriched);
          catchUpHint = catchUpHint || String(pre.id ?? "").trim();
          mergedSnapshot = true;
        }
        /** 서버 직렬화가 본문을 잘랐으면(14k 초과) 스냅샷은 가속일 뿐 — 단건 정합으로 전체 본문을 받는다. */
        const snapshotTruncated = Boolean(pre && pre.content.length >= 13_999 && pre.content.endsWith("…"));
        /**
         * 이 기기 낙관 행 — 스냅샷으로 pending 교체만, 정합은 송신 ACK 경로가 소유(추가 GET 금지).
         * 내 기기가 이미 가진 확정 행의 제자리 갱신 — 스냅샷을 병합했으면 HTTP catch-up 생략.
         * 스냅샷이 없으면(삭제·수정 등) messages/{id} 단건 정합으로 다른 기기 변경을 반영한다.
         */
        if (item.ownDecision === "replace_pending" && !snapshotTruncated) continue;
        if (item.ownDecision === "merge_only" && mergedSnapshot && !snapshotTruncated) continue;
        const fullyMerged = mergedSnapshot && !snapshotTruncated;
        request.bumpCount += 1;
        if (catchUpHint) request.hints.push(catchUpHint);
        if (!fullyMerged) {
          request.allMergedSnapshot = false;
          if (catchUpHint) request.unmergedHints.push(catchUpHint);
        }
      }
      if (enrichedAll.length > 0) {
        setRoomMessages((prev) => mergeRoomMessages(prev, enrichedAll));
        for (const enriched of enrichedAll) {
          const tipRoomId = String(enriched.roomId || streamRoomId || roomId).trim();
          if (!tipRoomId) continue;
          applyIncomingMessageEvent({
            viewerUserId: viewer,
            roomId: tipRoomId,
            roomSummary: snapshotRef.current?.room ?? undefined,
            message: enriched,
            messageRow: {
              id: enriched.id,
              room_id: tipRoomId,
              sender_id: enriched.senderId,
              message_type: enriched.messageType,
              content: enriched.content,
              metadata: enriched.metadata ?? null,
              created_at: enriched.createdAt,
            },
          });
        }
      }
      if (request.bumpCount > 0) scheduleCatchUp(request);
    };

    const frameQueue = createRoomBumpFrameQueue<QueuedBump>({
      flush: flushBumps,
      onFrameHandle: (id) => {
        remoteBumpCatchUpRafRef.current = id;
      },
    });
    const onVisibilityForQueue = () => {
      if (document.visibilityState === "hidden") frameQueue.onHidden();
    };
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisibilityForQueue);

    const onBump = (payload: Record<string, unknown>) => {
      const known = communityMessengerBumpKnownRoomIds({
        routeRoomId: String(roomId ?? "").trim(),
        streamRoomId: String(streamRoomId ?? "").trim(),
        snapshotRoomId: snapshotRef.current?.room?.id ?? null,
      });
      if (!communityMessengerBumpPayloadMatchesKnownRooms(payload, known)) return;

      const listAction = typeof payload.listAction === "string" ? payload.listAction.trim() : "";
      const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
      if (listAction === "remove" || reason === "group_deleted") {
        const rid =
          (typeof payload.canonicalRoomId === "string" && payload.canonicalRoomId.trim()) ||
          (typeof payload.roomId === "string" && payload.roomId.trim()) ||
          String(streamRoomId ?? roomId ?? "").trim();
        const eventId =
          (typeof payload.eventIdentity === "string" && payload.eventIdentity.trim()) ||
          (typeof payload.messageId === "string" && payload.messageId.trim()) ||
          `group_deleted:${rid}`;
        void import("@/lib/community-messenger/home/group-delete-home-list-eviction").then((mod) => {
          mod.evictDeletedGroupRoomFromHomeLists({ roomId: rid, eventId });
        });
        return;
      }

      const from = typeof payload.fromUserId === "string" ? payload.fromUserId.trim() : "";
      const rawMessage = payload.message;
      const messageMetadata =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? (rawMessage as { metadata?: unknown }).metadata
          : null;
      const isStoreOrderSystemBump =
        messageMetadata &&
        typeof messageMetadata === "object" &&
        (messageMetadata as { domain?: unknown }).domain === "store_order";
      const rawSenderId =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? typeof (rawMessage as { senderId?: unknown }).senderId === "string"
            ? String((rawMessage as { senderId: string }).senderId).trim()
            : ""
          : "";
      const hint =
        typeof payload.messageId === "string"
          ? payload.messageId.trim()
          : typeof (payload as { message_id?: unknown }).message_id === "string"
            ? String((payload as { message_id: string }).message_id).trim()
            : "";
      const rawClientMessageId =
        rawMessage && typeof rawMessage === "object" && rawMessage !== null
          ? typeof (rawMessage as { clientMessageId?: unknown }).clientMessageId === "string"
            ? String((rawMessage as { clientMessageId: string }).clientMessageId).trim()
            : ""
          : "";
      /**
       * Own bumps: THIS device's still-pending optimistic row (same clientMessageId) → replace by validated
       * snapshot only (no extra GET; the send ACK owns reconcile). Confirmed local rows (HTTP rows carry the cid
       * too) → in-place merge so same-account other-device edits/deletes apply.
       * Server-authored rows in viewer's name (call_stub, group system) and other-device sends must apply.
       * Peer-mutated same-id UPDATE (fromUserId !== message.senderId) is never "own" — HTTP reconcile SSOT.
       */
      const ownDecision = resolveOwnRoomBumpDecision({
        viewerUserId: viewer,
        fromUserId: from,
        rawSenderId,
        isStoreOrderSystemBump: Boolean(isStoreOrderSystemBump),
        messageId: hint,
        clientMessageId: rawClientMessageId,
        localMessages: roomMessagesRef.current,
      });

      const dedupeKey = resolveRoomBumpDedupeKey(payload);
      if (lastRemoteBumpDedupeRef.current === dedupeKey) return;
      lastRemoteBumpDedupeRef.current = dedupeKey;

      frameQueue.push({ payload, hint, ownDecision });
    };
    listenerRef.current.onBump = onBump;
    const release = acquireRoomBumpListener(viewer, bumpSubscribeIds, listenerRef);

    return () => {
      lastRemoteBumpDedupeRef.current = "";
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibilityForQueue);
      frameQueue.dispose();
      remoteBumpCatchUpRafRef.current = null;
      if (catchUpTimer != null) {
        clearTimeout(catchUpTimer);
        catchUpTimer = null;
      }
      pendingRequest = null;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs(snapshotRef·roomMessagesRef 등)·setter 는 안정 식별자; catchUp 은 ref 경유
  }, [bumpSubscribeIdsKey, roomId, roomReadyForRealtime, streamRoomId, viewer]);
}
