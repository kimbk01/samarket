import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";

/** 클라이언트 `cm-read-ack-broadcast-client.ts` 와 동일 토픽 — 서비스 롤 전용 발행 */
export const CM_READ_ACK_CHANNEL_NAME = "cm_read_ack";
export const CM_READ_ACK_BROADCAST_EVENT = "read_ack";

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
}): Promise<void> {
  let sb: SupabaseClient<any>;
  try {
    sb = getSupabaseServer();
  } catch {
    return;
  }
  const roomId = args.roomId.trim();
  const readerUserId = args.readerUserId.trim();
  if (!roomId || !readerUserId) return;

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
  } catch {
    /* Realtime 미설정·타임아웃 — HTTP 스냅샷으로 수렴 */
  } finally {
    try {
      void sb.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}
