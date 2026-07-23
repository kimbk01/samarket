"use client";

/**
 * 방 텍스트 메시지: Supabase Realtime → Message Authority (1건씩).
 * rAF batch / setRoomMessages 금지 — Telegram Message Pipeline Authority.
 *
 * @see docs/messenger-realtime-policy.md
 */
import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
  type RefObject,
} from "react";
import {
  useCommunityMessengerRoomRealtime,
  type CommunityMessengerRoomRealtimeMessageEvent,
} from "@/lib/community-messenger/use-community-messenger-realtime";
import type {
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSnapshot,
} from "@/lib/community-messenger/types";
import { mapRealtimeRoomMessage } from "@/components/community-messenger/room/community-messenger-room-helpers";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import {
  cmRtLogIngestBatch,
  cmRtLogRoomIdentity,
  isCommunityMessengerRealtimeDebugEnabled,
} from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import { messengerRoomTracksScrollPosition } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { logChatRoomTimelineRealtime } from "@/lib/community-messenger/room/messenger-room-timeline-log";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import {
  logMessengerRoomNewMessagesChipShow,
  readMessengerRoomNearBottomFromViewport,
  syncMessengerRoomStickToBottomFromViewport,
} from "@/lib/community-messenger/room/messenger-room-scroll-near-bottom";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
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
import { authorityApplyRealtime } from "@/lib/community-messenger/room/message-authority/message-authority";

export type MessengerRoomRealtimeMessageIngestArgs = {
  routeRoomId: string;
  streamRoomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  initialServerSnapshot?: CommunityMessengerRoomSnapshot | null;
  viewerUserIdHint?: string | null;
  roomReadyForRealtime: boolean;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMembersDisplayRef: MutableRefObject<CommunityMessengerProfileLite[]>;
  stickToBottomRef: MutableRefObject<boolean>;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  peerTailMarkReadHintRef?: MutableRefObject<string | null>;
  onRefresh: () => void;
  onParticipantPostgres?: (payload: {
    eventType: string;
    roomId: string;
    newRecord: Record<string, unknown> | null;
    oldRecord: Record<string, unknown> | null;
  }) => void;
  timelineInitialLoadComplete?: boolean;
};

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
    onRefresh,
    onParticipantPostgres,
    timelineInitialLoadComplete = false,
  } = args;

  const pendingRealtimeRef = useRef<CommunityMessengerRoomRealtimeMessageEvent[]>([]);
  const lastRoomIdentityDebugSigRef = useRef<string>("");

  const applyOneRealtimeEvent = useCallback(
    (event: CommunityMessengerRoomRealtimeMessageEvent) => {
      const snap = snapshotRef.current;
      if (!snap || !timelineInitialLoadComplete) {
        pendingRealtimeRef.current.push(event);
        logChatRoomTimelineRealtime("queued", {
          roomId: streamRoomId.trim(),
          batchLen: 1,
          reason: !snap ? "snapshot_missing" : "initial_load_pending",
        });
        return;
      }

      const rid = streamRoomId.trim();
      const flushT0 = performance.now();
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

      if (event.eventType === "DELETE") {
        authorityApplyRealtime(rid, { eventType: "DELETE", message: event.message });
        return;
      }

      const mapped = mapRealtimeRoomMessage(snap, roomMembersDisplayRef.current, event.message);
      const midForLatency = String(event.message.id ?? "").trim();
      const createdAtForLatency = String(event.message.createdAt ?? "").trim();
      const latencyKey = cmReceiveLatencyKey({ roomId: rid, messageId: midForLatency });
      cmReceiveLatencyMark(latencyKey, {
        realtime_event_received_ms: cmReceiveLatencyNow(),
        realtime_payload_room_id: rid,
        realtime_payload_message_id: midForLatency,
        ...(createdAtForLatency ? { db_message_created_at: createdAtForLatency } : null),
      });
      cmReceiveLatencyMark(latencyKey, { receiver_store_apply_start_ms: cmReceiveLatencyNow() });

      authorityApplyRealtime(rid, { eventType: event.eventType, message: mapped });

      cmReceiveLatencyMark(latencyKey, { receiver_store_apply_done_ms: cmReceiveLatencyNow() });

      const isOwnInsert =
        event.eventType === "INSERT" &&
        Boolean(event.message.senderId) &&
        messengerUserIdsEqual(event.message.senderId, snap.viewerUserId);

      if (event.eventType === "INSERT" && !isOwnInsert) {
        if (
          peerTailMarkReadHintRef &&
          typeof document !== "undefined" &&
          document.visibilityState === "visible"
        ) {
          if (midForLatency) peerTailMarkReadHintRef.current = midForLatency;
        }
        postCommunityMessengerBusEvent({
          type: "cm.room.incoming_message",
          roomId: rid,
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

        if (rid && messengerRoomTracksScrollPosition() && !nearBottomForIngest) {
          useMessengerRoomReaderStateStore.getState().bumpPendingNewFromOthers(rid, 1);
          const pendingTotal =
            useMessengerRoomReaderStateStore.getState().byRoom[rid]?.pendingNewBelow ?? 1;
          logMessengerRoomNewMessagesChipShow({
            roomId: rid,
            delta: 1,
            pendingTotal,
          });
        }
        if (cmPolishAnalysisEnabled() && midForLatency) {
          markCmPolishPeerRealtimeFlush(midForLatency, flushT0);
        }
      }

      logChatRoomTimelineRealtime("merged", {
        roomId: rid,
        mergedCount: 1,
      });
      if (event.eventType === "INSERT") {
        cmRtReadSyncLog("message_insert_apply_to_room", {
          roomId: rid,
          routeRoomId: routeRoomId.trim(),
          viewerUserId: snap.viewerUserId,
          messageId: midForLatency || null,
          batchInsertCount: 1,
        });
      }
      if (isCommunityMessengerRealtimeDebugEnabled()) {
        cmRtLogIngestBatch({
          streamRoomId: rid,
          routeRoomId: routeRoomId.trim(),
          batchLen: 1,
          eventTypes: [event.eventType],
          messageIds: [event.message.id],
        });
      }
    },
    [
      routeRoomId,
      peerTailMarkReadHintRef,
      roomMembersDisplayRef,
      snapshotRef,
      stickToBottomRef,
      messagesViewportRef,
      streamRoomId,
      timelineInitialLoadComplete,
    ]
  );

  const handleRealtimeMessageEvent = useCallback(
    (event: CommunityMessengerRoomRealtimeMessageEvent) => {
      applyOneRealtimeEvent(event);
    },
    [applyOneRealtimeEvent]
  );

  useEffect(() => {
    if (!snapshot || !timelineInitialLoadComplete) return;
    const queued = pendingRealtimeRef.current;
    if (queued.length === 0) return;
    pendingRealtimeRef.current = [];
    logChatRoomTimelineRealtime("merged", {
      roomId: streamRoomId.trim(),
      mergedCount: queued.length,
      source: "pending_queue_drain",
    });
    for (const event of queued) {
      applyOneRealtimeEvent(event);
    }
  }, [snapshot, timelineInitialLoadComplete, applyOneRealtimeEvent, streamRoomId]);

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
        batchQueued: 0,
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
