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
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";

export type MessengerRoomRealtimeMessageIngestArgs = {
  roomId: string;
  snapshot: CommunityMessengerRoomSnapshot | null;
  roomReadyForRealtime: boolean;
  snapshotRef: MutableRefObject<CommunityMessengerRoomSnapshot | null>;
  roomMembersDisplayRef: MutableRefObject<CommunityMessengerProfileLite[]>;
  stickToBottomRef: MutableRefObject<boolean>;
  setRoomMessages: Dispatch<SetStateAction<Array<CommunityMessengerMessage & { pending?: boolean }>>>;
  onRefresh: () => void;
};

export function useMessengerRoomRealtimeMessageIngest(args: MessengerRoomRealtimeMessageIngestArgs): void {
  const {
    roomId,
    snapshot,
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
    const rid = roomId?.trim();
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
          cur = mergeRoomMessages(cur, [mapRealtimeRoomMessage(snap, roomMembersDisplayRef.current, event.message)]);
        }
      }
      return cur;
    });
    if (insertFromOthers > 0 && rid) {
      useMessengerRoomReaderStateStore.getState().bumpPendingNewFromOthers(rid, insertFromOthers);
    }
  }, [roomId, roomMembersDisplayRef, setRoomMessages, snapshotRef, stickToBottomRef]);

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

  useCommunityMessengerRoomRealtime({
    roomId,
    enabled: Boolean(roomId) && roomReadyForRealtime && snapshot !== null,
    onRefresh,
    onMessageEvent: handleRealtimeMessageEvent,
  });
}
