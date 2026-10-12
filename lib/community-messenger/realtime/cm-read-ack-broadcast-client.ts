"use client";

/**
 * 방 단위 **비공개** 토픽 `cm-read-ack:<roomId>` — 상대 mark_read 직후 서버(서비스 롤) broadcast 수신.
 * 방 Phase1 이 열린 방마다 acquire(같은 viewer+room 은 refcount 공유).
 * 수신 권한: `realtime.messages` SELECT 정책(방 접근 가능자) — 구 전역 토픽 `cm_read_ack` 는 폐기.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { createRealtimeAuthBridge } from "@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  CM_READ_ACK_BROADCAST_EVENT,
  communityMessengerReadAckChannelName,
} from "@/lib/community-messenger/realtime/cm-read-ack-channel";
import {
  createMessengerPrivateChannelStatusHandler,
  messengerPrivateBroadcastChannelOptions,
} from "@/lib/community-messenger/realtime/private-broadcast-client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { subscribeSamarketRealtimeTokenRefreshed } from "@/lib/supabase/realtime-auth-events";

export { CM_READ_ACK_BROADCAST_EVENT, communityMessengerReadAckChannelName };

type ReadAckEntry = { refcount: number; stop: () => void };
const readAckEntries = new Map<string, ReadAckEntry>();

function subscribeCmReadAckBroadcast(viewerUserId: string, subscribeRoomId: string): () => void {
  const sb = getSupabaseClient();
  if (!sb) return () => undefined;

  let cancelled = false;
  let ch: RealtimeChannel | null = null;
  let readAckGeneration = 0;

  const onBroadcast = (msg: unknown, callbackGeneration: number) => {
    if (cancelled || callbackGeneration !== readAckGeneration) return;
    const raw =
      msg && typeof msg === "object" && "payload" in msg
        ? (msg as { payload?: unknown }).payload
        : undefined;
    const p = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const roomId = typeof p.roomId === "string" ? p.roomId.trim() : "";
    const readerUserId = typeof p.readerUserId === "string" ? p.readerUserId.trim() : "";
    const lastReadMessageId =
      typeof p.lastReadMessageId === "string" && p.lastReadMessageId.trim() ? p.lastReadMessageId.trim() : null;
    const lastReadAt = typeof p.lastReadAt === "string" && p.lastReadAt.trim() ? p.lastReadAt.trim() : null;
    if (!roomId || !readerUserId) return;
    /** 토픽=방 — 페이로드 roomId 가 다른 방이면 무시(라우팅 방어) */
    if (roomId.toLowerCase() !== subscribeRoomId) return;
    if (messengerUserIdsEqual(readerUserId, viewerUserId)) return;

    cmRtReadSyncLog("read_ack_broadcast_received", {
      roomId,
      viewerUserId,
      participantUserId: readerUserId,
      lastReadMessageId,
      lastReadAt,
    });

    postCommunityMessengerBusEvent({
      type: "cm.room.peer_read_ack",
      roomId,
      readerUserId,
      lastReadMessageId,
      lastReadAt,
      at: Date.now(),
    });
  };

  const subscribeReadAckChannel = () => {
    if (cancelled) return;
    const bindGen = ++readAckGeneration;
    if (ch) {
      try {
        void sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
      ch = null;
    }
    ch = sb
      .channel(communityMessengerReadAckChannelName(subscribeRoomId), messengerPrivateBroadcastChannelOptions())
      .on("broadcast", { event: CM_READ_ACK_BROADCAST_EVENT }, (msg) => onBroadcast(msg, bindGen))
      .subscribe(createMessengerPrivateChannelStatusHandler({ sb, scope: "read_ack" }));
  };

  const bridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: subscribeReadAckChannel,
  });

  const unsubscribeTokenRefresh = subscribeSamarketRealtimeTokenRefreshed(() => {
    if (cancelled) return;
    subscribeReadAckChannel();
  });

  return () => {
    cancelled = true;
    unsubscribeTokenRefresh();
    bridgeCleanup();
    if (ch) {
      try {
        void sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
      ch = null;
    }
  };
}

/**
 * 방 단위 read-ack 비공개 구독 — 같은 viewer+room 은 refcount 로 공유.
 * `roomId` 는 서버 발행과 같은 canonical `community_messenger_rooms.id` (방 Phase1 의 `streamRoomId`).
 */
export function acquireCommunityMessengerReadAckBroadcast(viewerUserId: string, roomId: string): () => void {
  const uid = viewerUserId.trim();
  const rid = String(roomId ?? "").trim().toLowerCase();
  if (!uid || !rid) return () => undefined;
  const key = `${uid}\0${rid}`;

  let entry = readAckEntries.get(key);
  if (!entry) {
    entry = { refcount: 0, stop: subscribeCmReadAckBroadcast(uid, rid) };
    readAckEntries.set(key, entry);
  }
  entry.refcount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const cur = readAckEntries.get(key);
    if (!cur) return;
    cur.refcount = Math.max(0, cur.refcount - 1);
    if (cur.refcount === 0) {
      readAckEntries.delete(key);
      cur.stop();
    }
  };
}
