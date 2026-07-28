"use client";

/**
 * 방 텍스트 메시지: Supabase Realtime INSERT/UPDATE/DELETE → React 목록 반영만 담당.
 * 네이티브 앱의 “동기화 레이어”에 해당하는 얇은 경계 — Phase1 에서 분리해 유지보수·테스트 단위를 만든다.
 *
 * @see docs/messenger-vs-native-chat-apps.md
 * @see docs/messenger-realtime-policy.md
 */
import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  useCommunityMessengerRoomRealtime,
  type CommunityMessengerRoomRealtimeMessageEvent,
} from "@/lib/community-messenger/use-community-messenger-realtime";
import type {
  CommunityMessengerMessage,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { mapRealtimeRoomMessage, mergeRoomMessages } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  cmRtLogIngestBatch,
  cmRtLogRoomIdentity,
  isCommunityMessengerRealtimeDebugEnabled,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import { messengerRolloutUsesRoomScrollHints, messengerRoomTracksScrollPosition } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import {
  logChatRoomTimelineRealtime,
} from "@/lib/community-messenger/room/messenger-room-timeline-log";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import {
  logMessengerRoomNewMessagesChipShow,
  readMessengerRoomNearBottomFromViewport,
  syncMessengerRoomStickToBottomFromViewport,
} from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import {
  projectRoomActivityToHomeList,
  roomActivityFromMessengerMessage,
} from "@/lib/community-messenger/home/project-room-activity-to-home-list";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";
import {
  cmReceiveLatencyKey,
  cmReceiveLatencyMark,
  cmReceiveLatencyNow,
} from "@/lib/community-messenger/monitoring/cm-receive-latency";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  cmPolishAnalysisEnabled,
  markCmPolishPeerRealtimeFlush,
} from "@/lib/community-messenger/monitoring/cm-polish-analysis";
import { messengerVerboseTraceConsoleEnabled } from "@/lib/community-messenger/messenger-trace-console";

function dedupeRealtimeMessageBatch(
  events: CommunityMessengerRoomRealtimeMessageEvent[]
): CommunityMessengerRoomRealtimeMessageEvent[] {
  if (events.length <= 1) return events;
  const byId = new Map<string, CommunityMessengerRoomRealtimeMessageEvent>();
  const noId: CommunityMessengerRoomRealtimeMessageEvent[] = [];
  for (const event of events) {
    const id = String(event.message.id ?? "").trim();
    if (!id) {
      noId.push(event);
      continue;
    }
    byId.set(id, event);
  }
  if (byId.size === 0) return events;
  return [...byId.values(), ...noId];
}

export type MessengerRoomRealtimeMessageIngestArgs = {
  /** 라우트·액션 시트 등에 쓰는 URL 방 id (거래/레거시 id 일 수 있음) */
  routeRoomId: string;
  /** `community_messenger_messages.room_id` 및 Realtime 필터에 쓰는 원장 방 id — 반드시 `snapshot.room.id` 우선 */
  streamRoomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  /** RSC 시드 — `snapshot` state 가 아직 비어 있어도 동일 값이면 Realtime 을 바로 연다 */
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
  /** RSC `viewerUserId` — `snapshot` 이 한 틱 늦게 올 때 Realtime 채널 키용 */
  viewerUserIdHint?: string | null;
  roomReadyForRealtime: boolean;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMembersDisplayRef: MutableRefObject<CommunityMessengerProfileLite[]>;
  stickToBottomRef: MutableRefObject<boolean>;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  /** 상대 INSERT 직후 `mark_read` 가시 조건 완화 — @see useMessengerRoomOpenMarkReadEffect */
  peerTailMarkReadHintRef?: MutableRefObject<string | null>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  onRefresh: () => void;
  /** @see global-messenger-room-bundle-channel `community_messenger_participants` */
  onParticipantPostgres?: (payload: {
    eventType: string;
    roomId: string;
    newRecord: Record<string, unknown> | null;
    oldRecord: Record<string, unknown> | null;
  }) => void;
  /** initial fetch 완료 전 Realtime merge 보류 — race 방지 */
  timelineInitialLoadComplete?: boolean;
};

const CM_RT_MESSAGE_INGEST_CHUNK_SIZE = 28;

export function useMessengerRoomRealtimeMessageIngest(args: MessengerRoomRealtimeMessageIngestArgs): void {
  const {
    routeRoomId,
    streamRoomId,
    snapshot,
    initialServerSnapshot = null,
    viewerUserIdHint = null,
    roomReadyForRealtime,
    snapshotRef,
    roomMembersDisplayRef,
    stickToBottomRef,
    messagesViewportRef,
    peerTailMarkReadHintRef,
    setRoomMessages,
    onRefresh,
    onParticipantPostgres,
    timelineInitialLoadComplete = false,
  } = args;

  const pendingRealtimeRef = useRef<CommunityMessengerRoomRealtimeMessageEvent[]>([]);
  const realtimeMessageBatchRef = useRef<CommunityMessengerRoomRealtimeMessageEvent[]>([]);
  const realtimeBatchFlushRafRef = useRef<number | null>(null);
  /** `snapshot` 참조만 바뀌는 경우(메시지 병합 등) room_identity 디버그 로그가 연속으로 찍히지 않게 */
  const lastRoomIdentityDebugSigRef = useRef<string>("");

  useEffect(() => {
    return () => {
      if (realtimeBatchFlushRafRef.current !== null) {
        cancelAnimationFrame(realtimeBatchFlushRafRef.current);
        realtimeBatchFlushRafRef.current = null;
      }
    };
  }, []);

  const applyRealtimeMessageBatch = useCallback((rawBatch: CommunityMessengerRoomRealtimeMessageEvent[]) => {
    const batch = dedupeRealtimeMessageBatch(rawBatch);
    if (batch.length === 0) return;
    const snap = snapshotRef.current;
    if (!snap || !timelineInitialLoadComplete) {
      pendingRealtimeRef.current.push(...batch);
      logChatRoomTimelineRealtime("queued", {
        roomId: streamRoomId.trim(),
        batchLen: batch.length,
        reason: !snap ? "snapshot_missing" : "initial_load_pending",
      });
      return;
    }
    logChatRoomTimelineRealtime("received", {
      roomId: streamRoomId.trim(),
      batchLen: batch.length,
    });
    const flushT0 = performance.now();
    let lastPeerInsertIdForPolish: string | null = null;
    {
      const viewerP = snap.viewerUserId;
      for (const event of batch) {
        if (event.eventType !== "INSERT") continue;
        const sid = event.message.senderId;
        if (!sid || messengerUserIdsEqual(sid, viewerP)) continue;
        lastPeerInsertIdForPolish = String(event.message.id ?? "").trim() || null;
      }
    }
    const rid = streamRoomId?.trim();
    const viewportMetrics = readMessengerRoomNearBottomFromViewport(messagesViewportRef.current);
    let nearBottomForIngest: boolean;
    if (viewportMetrics) {
      nearBottomForIngest = viewportMetrics.nearBottom;
      stickToBottomRef.current = nearBottomForIngest;
    } else if (rid) {
      const scrollPos = useMessengerRoomReaderStateStore.getState().getScrollPositionForPolicy(rid);
      nearBottomForIngest = scrollPos === "at-bottom" || scrollPos === "near-bottom";
      stickToBottomRef.current = nearBottomForIngest;
    } else {
      nearBottomForIngest = stickToBottomRef.current;
    }
    let insertFromOthers = 0;
    if (rid && messengerRoomTracksScrollPosition() && !nearBottomForIngest) {
      const viewer = snap.viewerUserId;
      for (const event of batch) {
        if (event.eventType !== "INSERT") continue;
        const sid = event.message.senderId;
        if (!sid || messengerUserIdsEqual(sid, viewer)) continue;
        insertFromOthers += 1;
      }
    }
    const mergeCandidateCount = batch.filter((e) => e.eventType !== "DELETE").length;
    setRoomMessages((prev) => {
      let cur = prev;
      const incomingToMerge: CommunityMessengerMessage[] = [];
      for (const event of batch) {
        if (event.eventType === "DELETE") {
          cur = cur.filter((item) => item.id !== event.message.id);
        } else {
          const mapped = mapRealtimeRoomMessage(snap, roomMembersDisplayRef.current, event.message);
          const ridForLatency = streamRoomId.trim();
          const midForLatency = String(event.message.id ?? "").trim();
          const createdAtForLatency = String(event.message.createdAt ?? "").trim();
          const latencyKey = cmReceiveLatencyKey({ roomId: ridForLatency, messageId: midForLatency });
          cmReceiveLatencyMark(latencyKey, {
            realtime_event_received_ms: cmReceiveLatencyNow(),
            realtime_payload_room_id: ridForLatency,
            realtime_payload_message_id: midForLatency,
            ...(createdAtForLatency ? { db_message_created_at: createdAtForLatency } : null),
          });
          cmReceiveLatencyMark(latencyKey, { receiver_store_apply_start_ms: cmReceiveLatencyNow() });
          applyIncomingMessageEvent({
            viewerUserId: snap.viewerUserId,
            roomId: streamRoomId.trim(),
            roomSummary: snap.room,
            message: mapped,
            messageRow: {
              id: event.message.id,
              room_id: event.message.roomId,
              sender_id: event.message.senderId,
              message_type: event.message.messageType,
              content: event.message.content,
              metadata: event.message.metadata,
              created_at: event.message.createdAt,
            },
          });
          cmReceiveLatencyMark(latencyKey, { receiver_store_apply_done_ms: cmReceiveLatencyNow() });
          const isOwnInsert =
            event.eventType === "INSERT" &&
            Boolean(event.message.senderId) &&
            messengerUserIdsEqual(event.message.senderId, snap.viewerUserId);
          if (isOwnInsert) {
            const ownCid =
              typeof mapped.clientMessageId === "string" ? mapped.clientMessageId.trim() : "";
            if (ownCid) {
              cur = cur.filter(
                (row) =>
                  !(
                    row.pending &&
                    typeof row.clientMessageId === "string" &&
                    row.clientMessageId.trim() === ownCid
                  )
              );
            } else {
              // clientMessageId가 RT 메타에 없을 때: content + messageType + sender + 3s 타임윈도우로 pending 제거
              const mappedAt = new Date(mapped.createdAt).getTime();
              cur = cur.filter(
                (row) =>
                  !(
                    row.pending &&
                    row.senderId === mapped.senderId &&
                    row.messageType === mapped.messageType &&
                    row.content === mapped.content &&
                    Number.isFinite(mappedAt) &&
                    Math.abs(new Date(row.createdAt).getTime() - mappedAt) < 3_000
                  )
              );
            }
          }
          if (event.eventType === "INSERT") {
            if (
              !isOwnInsert &&
              peerTailMarkReadHintRef &&
              typeof document !== "undefined" &&
              document.visibilityState === "visible"
            ) {
              const mid = String(event.message.id ?? "").trim();
              if (mid) peerTailMarkReadHintRef.current = mid;
            }
            /**
             * B body: timeline commit → hub tip projection (Home unmount-safe).
             * Own INSERT also projects — covers ACK-miss / non-composer send; same eventId → no-op after ACK.
             * Bus remains for Home React sync / Domain spine (peer only).
             */
            const tipActivity = roomActivityFromMessengerMessage({
              message: mapped,
              source: isOwnInsert ? "local_send_ack" : "remote_message_realtime",
              boostUnread: !isOwnInsert,
              viewerUserId: snap.viewerUserId,
            });
            if (tipActivity) {
              projectRoomActivityToHomeList(tipActivity);
            }
            if (!isOwnInsert) {
              postCommunityMessengerBusEvent({
                type: "cm.room.incoming_message",
                roomId: streamRoomId.trim(),
                viewerUserId: snap.viewerUserId,
                messageRow: {
                  id: event.message.id,
                  room_id: event.message.roomId,
                  sender_id: event.message.senderId,
                  message_type: event.message.messageType,
                  content: event.message.content,
                  metadata: event.message.metadata,
                  created_at: event.message.createdAt,
                },
                at: Date.now(),
              });
            }
          }
          incomingToMerge.push(mapped);
        }
      }
      return incomingToMerge.length > 0 ? mergeRoomMessages(cur, incomingToMerge) : cur;
    });
    if (mergeCandidateCount > 0) {
      logChatRoomTimelineRealtime("merged", {
        roomId: streamRoomId.trim(),
        mergedCount: mergeCandidateCount,
      });
    }
    if (lastPeerInsertIdForPolish && cmPolishAnalysisEnabled()) {
      markCmPolishPeerRealtimeFlush(lastPeerInsertIdForPolish, flushT0);
    }
    const inserted = batch.filter((e) => e.eventType === "INSERT");
    if (inserted.length > 0 && snap) {
      const lastIns = inserted[inserted.length - 1]!;
      cmRtReadSyncLog("message_insert_apply_to_room", {
        roomId: streamRoomId.trim(),
        routeRoomId: routeRoomId.trim(),
        viewerUserId: snap.viewerUserId,
        messageId: String(lastIns.message.id ?? "").trim() || null,
        batchInsertCount: inserted.length,
      });
    }
    if (insertFromOthers > 0 && rid) {
      useMessengerRoomReaderStateStore.getState().bumpPendingNewFromOthers(rid, insertFromOthers);
      const pendingTotal =
        useMessengerRoomReaderStateStore.getState().byRoom[rid]?.pendingNewBelow ?? insertFromOthers;
      logMessengerRoomNewMessagesChipShow({
        roomId: rid,
        delta: insertFromOthers,
        pendingTotal,
      });
    }
    if (isCommunityMessengerRealtimeDebugEnabled() && batch.length > 0) {
      cmRtLogIngestBatch({
        streamRoomId: streamRoomId.trim(),
        routeRoomId: routeRoomId.trim(),
        batchLen: batch.length,
        eventTypes: batch.map((e) => e.eventType),
        messageIds: batch.map((e) => e.message.id),
      });
    }
    if (messengerVerboseTraceConsoleEnabled() && batch.length >= 8) {
      // eslint-disable-next-line no-console -- gated perf diagnostics
      console.info(
        "[cm-rt-ingest-burst]",
        JSON.stringify({
          batchLen: batch.length,
          durationMs: Math.round(performance.now() - flushT0),
          pendingQueued: pendingRealtimeRef.current.length,
          streamRoomId: streamRoomId.trim(),
        })
      );
    }
  }, [
    routeRoomId,
    peerTailMarkReadHintRef,
    roomMembersDisplayRef,
    setRoomMessages,
    snapshotRef,
    stickToBottomRef,
    messagesViewportRef,
    streamRoomId,
    timelineInitialLoadComplete,
  ]);

  const flushRealtimeMessageBatch = useCallback(() => {
    realtimeBatchFlushRafRef.current = null;
    const batch = realtimeMessageBatchRef.current.splice(0, CM_RT_MESSAGE_INGEST_CHUNK_SIZE);
    if (batch.length === 0) return;
    if (realtimeMessageBatchRef.current.length > 0) {
      realtimeBatchFlushRafRef.current = window.requestAnimationFrame(() => {
        flushRealtimeMessageBatch();
      });
    }
    applyRealtimeMessageBatch(batch);
  }, [applyRealtimeMessageBatch]);

  const handleRealtimeMessageEvent = useCallback(
    (event: CommunityMessengerRoomRealtimeMessageEvent) => {
      const tail = realtimeMessageBatchRef.current[realtimeMessageBatchRef.current.length - 1];
      const eventId = String(event.message.id ?? "").trim();
      if (
        tail &&
        eventId &&
        String(tail.message.id ?? "").trim() === eventId &&
        tail.eventType === event.eventType
      ) {
        realtimeMessageBatchRef.current[realtimeMessageBatchRef.current.length - 1] = event;
      } else {
        realtimeMessageBatchRef.current.push(event);
      }
      if (realtimeBatchFlushRafRef.current !== null) return;
      realtimeBatchFlushRafRef.current = window.requestAnimationFrame(() => {
        flushRealtimeMessageBatch();
      });
    },
    [flushRealtimeMessageBatch]
  );

  useEffect(() => {
    if (!snapshot || !timelineInitialLoadComplete) return;
    const queued = pendingRealtimeRef.current;
    if (queued.length === 0) return;
    pendingRealtimeRef.current = [];
    const deduped = dedupeRealtimeMessageBatch(queued);
    logChatRoomTimelineRealtime("merged", {
      roomId: streamRoomId.trim(),
      mergedCount: deduped.length,
      source: "pending_queue_drain",
    });
    let offset = 0;
    const runChunk = () => {
      const slice = deduped.slice(offset, offset + CM_RT_MESSAGE_INGEST_CHUNK_SIZE);
      offset += slice.length;
      if (slice.length === 0) return;
      applyRealtimeMessageBatch(slice);
      if (offset < deduped.length) {
        window.requestAnimationFrame(runChunk);
      }
    };
    runChunk();
  }, [snapshot, timelineInitialLoadComplete, applyRealtimeMessageBatch, streamRoomId]);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_MESSENGER_PERF_TRACE !== "1") return;
    if (typeof window === "undefined") return;
    const w = window as Window & {
      __cmPerfSimulateRealtimeBurst?: (count: number) => { batchQueued: number; pendingQueued: number };
      __cmPerfSyncScrollNearBottom?: () => boolean;
    };
    w.__cmPerfSyncScrollNearBottom = () =>
      syncMessengerRoomStickToBottomFromViewport({
        viewport: messagesViewportRef.current,
        stickToBottomRef,
        roomId: streamRoomId.trim(),
        emitScrollLogs: true,
      });
    w.__cmPerfSimulateRealtimeBurst = (count) => {
      const rid = streamRoomId.trim();
      const peer = "00000000-0000-0000-0000-000000000099";
      const stamp = Date.now();
      for (let i = 0; i < count; i += 1) {
        handleRealtimeMessageEvent({
          eventType: "INSERT",
          message: {
            id: `cm-perf-burst-${stamp}-${i}`,
            roomId: rid,
            senderId: peer,
            messageType: "text",
            content: `burst-${i}`,
            metadata: {},
            createdAt: new Date().toISOString(),
          },
        });
      }
      return {
        batchQueued: realtimeMessageBatchRef.current.length,
        pendingQueued: pendingRealtimeRef.current.length,
      };
    };
    return () => {
      delete w.__cmPerfSimulateRealtimeBurst;
      delete w.__cmPerfSyncScrollNearBottom;
    };
  }, [handleRealtimeMessageEvent, messagesViewportRef, stickToBottomRef, streamRoomId]);

  const snapshotPresent = snapshot != null;
  useEffect(() => {
    if (!snapshot) {
      lastRoomIdentityDebugSigRef.current = "";
      return;
    }
    if (!isCommunityMessengerRealtimeDebugEnabled()) return;
    const rid = routeRoomId.trim();
    const sid = streamRoomId.trim();
    const vf = (snapshot.viewerUserId ?? "").trim() || "anon";
    const peer = snapshot.room.peerUserId ?? null;
    const ledgerId = (snapshot.room.id ?? "").trim();
    const sig = `${rid}|${sid}|${vf}|${peer ?? ""}|${ledgerId}`;
    if (lastRoomIdentityDebugSigRef.current === sig) return;
    lastRoomIdentityDebugSigRef.current = sig;
    cmRtLogRoomIdentity({
      routeRoomId: rid,
      streamRoomId: sid,
      viewerUserId: snapshot.viewerUserId,
      peerUserId: peer,
      channelName: `community-messenger-room:bundle:${vf}:${sid}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 스냅샷 객체 참조가 아닌 방·유저 식별 필드만 바뀔 때만(메시지 병합마다 effect 방지)
  }, [routeRoomId, streamRoomId, snapshotPresent, snapshot?.viewerUserId, snapshot?.room?.id, snapshot?.room?.peerUserId]);

  const seedSnapshot = snapshot ?? initialServerSnapshot;
  const viewerForChannel = (seedSnapshot?.viewerUserId ?? viewerUserIdHint ?? "").trim();
  const realtimeEnabled =
    Boolean(streamRoomId.trim()) &&
    roomReadyForRealtime &&
    (seedSnapshot !== null || viewerForChannel.length > 0);

  useCommunityMessengerRoomRealtime({
    roomId: streamRoomId.trim(),
    viewerUserId: viewerForChannel || null,
    enabled: realtimeEnabled,
    onRefresh,
    onMessageEvent: handleRealtimeMessageEvent,
    onParticipantPostgres,
  });
}
