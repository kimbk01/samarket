import { cmRtReadSyncLog } from "@/lib/community-messenger/read/cm-rt-read-sync-log";
import {
  CM_READ_ACK_BROADCAST_EVENT,
  communityMessengerReadAckChannelName,
} from "@/lib/community-messenger/realtime/cm-read-ack-channel";
import { publishMessengerPrivateBroadcastFromServer } from "@/lib/community-messenger/realtime/private-broadcast-server";

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

/**
 * 방 단위 비공개 토픽 `cm-read-ack:<roomId>` — 서비스 롤 REST broadcast 전용 발행.
 * (구 전역 토픽 `cm_read_ack` 는 인증 없이 모든 사용자의 읽음 커서가 노출되어 폐기)
 */
export { CM_READ_ACK_BROADCAST_EVENT, communityMessengerReadAckChannelName };

export type PublishCommunityMessengerReadAckResult = {
  sent: boolean;
  deduped: boolean;
  broadcast_emit_ms?: number;
  broadcast_wait_ms?: number;
};

/**
 * peer 읽음 — Postgres `participants` UPDATE 가 상대에게 안 보일 때(RLS·필터 한계) 카카오식 즉시 반영용.
 */
export async function publishCommunityMessengerReadAckFromServer(args: {
  roomId: string;
  readerUserId: string;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
}): Promise<PublishCommunityMessengerReadAckResult> {
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

  try {
    const tEmit0 = performance.now();
    const res = await publishMessengerPrivateBroadcastFromServer({
      scope: "read_ack",
      messages: [
        {
          topic: communityMessengerReadAckChannelName(roomId),
          event: CM_READ_ACK_BROADCAST_EVENT,
          payload: {
            roomId,
            readerUserId,
            lastReadMessageId: args.lastReadMessageId,
            lastReadAt: args.lastReadAt,
          },
        },
      ],
    });
    const broadcast_emit_ms = Math.round(performance.now() - tEmit0);
    if (!res.ok) {
      /* 실패는 private-broadcast-server 가 로그 — HTTP 스냅샷으로 수렴 */
      return { sent: false, deduped: false, broadcast_wait_ms: 0, broadcast_emit_ms };
    }
    cmRtReadSyncLog("read_ack_broadcast_sent", {
      roomId,
      viewerUserId: readerUserId,
      lastReadMessageId: args.lastReadMessageId,
      lastReadAt: args.lastReadAt,
    });
    readAckDedupUntil.set(dedupKey, Date.now() + readAckDedupTtlMs(roomId));
    /** REST 발행 — WS join 대기 없음 */
    return { sent: true, deduped: false, broadcast_wait_ms: 0, broadcast_emit_ms };
  } finally {
    readAckDedupInFlight.delete(dedupKey);
  }
}
