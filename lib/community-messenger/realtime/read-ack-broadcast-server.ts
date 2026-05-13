import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";

/** roomId+viewer+lastReadMessageId 기준 짧은 TTL 내 중복 broadcast 억제(prod 포함) */
const readAckDedupUntil = new Map<string, number>();
const readAckDedupInFlight = new Set<string>();

function readAckDedupTtlMs(roomId: string): number {
  let h = 0;
  for (let i = 0; i < roomId.length; i++) h = ((h * 31) ^ roomId.charCodeAt(i)) >>> 0;
  return 1500 + (h % 1001);
}

function normalizeReadAckMessageId(id: string | null | undefined): string {
  if (id == null) return "";
  return id.trim().toLowerCase();
}

function readAckDedupKey(roomId: string, viewerUserId: string, lastReadMessageId: string | null): string {
  return `${roomId}\0${viewerUserId}\0${normalizeReadAckMessageId(lastReadMessageId)}`;
}

/** 클라이언트 `cm-read-ack-broadcast-client.ts` 와 동일 토픽 — 서비스 롤 전용 발행 */
export const CM_READ_ACK_CHANNEL_NAME = "cm_read_ack";
export const CM_READ_ACK_BROADCAST_EVENT = "read_ack";

export type PublishCommunityMessengerReadAckResult = {
  sent: boolean;
  deduped: boolean;
};

function waitForChannelSubscribed(sb: SupabaseClient<any>, ch: RealtimeChannel, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        void sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
      reject(new Error("cm_read_ack_channel_timeout"));
    }, timeoutMs);
    ch.subscribe((status) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        clearTimeout(t);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        clearTimeout(t);
        try {
          void sb.removeChannel(ch);
        } catch {
          /* ignore */
        }
        reject(new Error(`cm_read_ack_channel_${status}`));
      }
    });
  });
}

/**
 * peer 읽음 — Postgres `participants` UPDATE 가 상대에게 안 보일 때(RLS·필터 한계) 카카오식 즉시 반영용.
 */
export async function publishCommunityMessengerReadAckFromServer(args: {
  roomId: string;
  readerUserId: string;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
}): Promise<PublishCommunityMessengerReadAckResult> {
  let sb: SupabaseClient<any>;
  try {
    sb = getSupabaseServer();
  } catch {
    return { sent: false, deduped: false };
  }
  const roomId = args.roomId.trim();
  const readerUserId = args.readerUserId.trim();
  if (!roomId || !readerUserId) return { sent: false, deduped: false };

  const dedupKey = readAckDedupKey(roomId, readerUserId, args.lastReadMessageId);
  const nowMs = Date.now();
  const until = readAckDedupUntil.get(dedupKey);
  if (until !== undefined && nowMs < until) {
    cmRtReadSyncLog("read_ack_broadcast_deduped", {
      roomId,
      viewerUserId: readerUserId,
      lastReadMessageId: args.lastReadMessageId,
      lastReadAt: args.lastReadAt,
      ignoredReason: "ttl_dedup",
    });
    return { sent: false, deduped: true };
  }
  if (readAckDedupInFlight.has(dedupKey)) {
    cmRtReadSyncLog("read_ack_broadcast_deduped", {
      roomId,
      viewerUserId: readerUserId,
      lastReadMessageId: args.lastReadMessageId,
      lastReadAt: args.lastReadAt,
      ignoredReason: "inflight_dedup",
    });
    return { sent: false, deduped: true };
  }
  readAckDedupInFlight.add(dedupKey);

  const ch = sb.channel(CM_READ_ACK_CHANNEL_NAME, { config: { broadcast: { ack: false } } });
  try {
    await waitForChannelSubscribed(sb, ch, 6500);
    await ch.send({
      type: "broadcast",
      event: CM_READ_ACK_BROADCAST_EVENT,
      payload: {
        roomId,
        readerUserId,
        lastReadMessageId: args.lastReadMessageId,
        lastReadAt: args.lastReadAt,
      },
    });
    cmRtReadSyncLog("read_ack_broadcast_sent", {
      roomId,
      viewerUserId: readerUserId,
      lastReadMessageId: args.lastReadMessageId,
      lastReadAt: args.lastReadAt,
    });
    readAckDedupUntil.set(dedupKey, Date.now() + readAckDedupTtlMs(roomId));
    return { sent: true, deduped: false };
  } catch {
    /* Realtime 미설정·타임아웃 — HTTP 스냅샷으로 수렴 */
    return { sent: false, deduped: false };
  } finally {
    try {
      void sb.removeChannel(ch);
    } catch {
      /* ignore */
    }
    readAckDedupInFlight.delete(dedupKey);
  }
}
