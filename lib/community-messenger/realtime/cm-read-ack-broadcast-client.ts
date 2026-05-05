"use client";

/**
 * 전역 토픽 `cm_read_ack` — 상대 mark_read 직후 서버 broadcast 수신.
 * 홈 realtime(`createHomeRealtimeEntry`)·방 Phase1 이 refcount 로 단일 구독 공유.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { messengerUserIdsEqual } from "@/lib/community-messenger/messenger-user-id";
import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";
import { createRealtimeAuthBridge } from "@/lib/community-messenger/realtime/community-messenger-realtime-auth-bridge";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import { getSupabaseClient } from "@/lib/supabase/client";

export const CM_READ_ACK_CHANNEL_NAME = "cm_read_ack";
export const CM_READ_ACK_BROADCAST_EVENT = "read_ack";

let refcount = 0;
let combinedStop: (() => void) | null = null;

function subscribeCmReadAckBroadcast(viewerUserId: string): () => void {
  const sb = getSupabaseClient();
  if (!sb) return () => undefined;

  let cancelled = false;
  let ch: RealtimeChannel | null = null;

  const onBroadcast = (msg: { payload?: unknown }) => {
    if (cancelled) return;
    const raw = msg.payload;
    const p = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const roomId = typeof p.roomId === "string" ? p.roomId.trim() : "";
    const readerUserId = typeof p.readerUserId === "string" ? p.readerUserId.trim() : "";
    const lastReadMessageId =
      typeof p.lastReadMessageId === "string" && p.lastReadMessageId.trim() ? p.lastReadMessageId.trim() : null;
    const lastReadAt = typeof p.lastReadAt === "string" && p.lastReadAt.trim() ? p.lastReadAt.trim() : null;
    if (!roomId || !readerUserId) return;
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

  const bridgeCleanup = createRealtimeAuthBridge({
    sb,
    isCancelled: () => cancelled,
    onReady: () => {
      if (cancelled) return;
      ch = sb
        .channel(CM_READ_ACK_CHANNEL_NAME, { config: { broadcast: { ack: false } } })
        .on("broadcast", { event: CM_READ_ACK_BROADCAST_EVENT }, onBroadcast)
        .subscribe();
    },
  });

  return () => {
    cancelled = true;
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

/** 단일 Supabase broadcast 구독 — 홈·방 양쪽에서 refcount 로 공유 */
export function acquireCommunityMessengerReadAckBroadcast(viewerUserId: string): () => void {
  const uid = viewerUserId.trim();
  if (!uid) return () => undefined;

  refcount += 1;
  if (refcount === 1) {
    combinedStop = subscribeCmReadAckBroadcast(uid);
  }
  return () => {
    refcount = Math.max(0, refcount - 1);
    if (refcount === 0) {
      combinedStop?.();
      combinedStop = null;
    }
  };
}
