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
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { applyIncomingMessageEvent } from "@/lib/community-messenger/stores/messenger-realtime-store";

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
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  onRefresh: () => void;
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
    setRoomMessages,
    onRefresh,
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

  const flushRealtimeMessageBatch = useCallback(() => {
    realtimeBatchFlushRafRef.current = null;
    const batch = realtimeMessageBatchRef.current.splice(0);
    if (batch.length === 0) return;
    const snap = snapshotRef.current;
    if (!snap) {
      pendingRealtimeRef.current.push(...batch);
      return;
    }
    const rid = streamRoomId?.trim();
    let insertFromOthers = 0;
    if (rid && messengerRolloutUsesRoomScrollHints() && !stickToBottomRef.current) {
      const viewer = snap.viewerUserId;
      for (const event of batch) {
        if (event.eventType !== "INSERT") continue;
        const sid = event.message.senderId;
        if (!sid || messengerUserIdsEqual(sid, viewer)) continue;
        insertFromOthers += 1;
      }
    }
    setRoomMessages((prev) => {
      let cur = prev;
      for (const event of batch) {
        if (event.eventType === "DELETE") {
          cur = cur.filter((item) => item.id !== event.message.id);
        } else {
          const mapped = mapRealtimeRoomMessage(snap, roomMembersDisplayRef.current, event.message);
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
          const isOwnInsert =
            event.eventType === "INSERT" &&
            Boolean(event.message.senderId) &&
            messengerUserIdsEqual(event.message.senderId, snap.viewerUserId);
          if (event.eventType === "INSERT" && !isOwnInsert) {
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
          cur = mergeRoomMessages(cur, [mapped]);
        }
      }
      return cur;
    });
    if (insertFromOthers > 0 && rid) {
      useMessengerRoomReaderStateStore.getState().bumpPendingNewFromOthers(rid, insertFromOthers);
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
  }, [routeRoomId, roomMembersDisplayRef, setRoomMessages, snapshotRef, stickToBottomRef, streamRoomId]);

  const handleRealtimeMessageEvent = useCallback(
    (event: CommunityMessengerRoomRealtimeMessageEvent) => {
      realtimeMessageBatchRef.current.push(event);
      if (realtimeBatchFlushRafRef.current !== null) return;
      realtimeBatchFlushRafRef.current = window.requestAnimationFrame(() => {
        flushRealtimeMessageBatch();
      });
    },
    [flushRealtimeMessageBatch]
  );

  useEffect(() => {
    if (!snapshot) return;
    const queued = pendingRealtimeRef.current;
    if (queued.length === 0) return;
    pendingRealtimeRef.current = [];
    setRoomMessages((prev) => {
      let cur = prev;
      for (const event of queued) {
        if (event.eventType === "DELETE") {
          cur = cur.filter((item) => item.id !== event.message.id);
        } else {
          cur = mergeRoomMessages(cur, [mapRealtimeRoomMessage(snapshot, roomMembersDisplayRef.current, event.message)]);
        }
      }
      return cur;
    });
  }, [snapshot, roomMembersDisplayRef, setRoomMessages]);

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
  });
}
