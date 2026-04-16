import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  CM_ROOM_BUMP_BROADCAST_EVENT,
  communityMessengerRoomBumpChannelName,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";

/** 방당 구독 유지 — 메시지마다 subscribe/WS 핸드셰이크를 반복하지 않는다(지연·부하 제거). */
const IDLE_EVICT_MS = 120_000;
const PRUNE_EVERY_MS = 30_000;

type RoomEntry = { ch: RealtimeChannel; lastUsed: number };

let publisherSb: SupabaseClient<any> | null = null;
const roomChannels = new Map<string, RoomEntry>();
const roomSubscribeLocks = new Map<string, Promise<RealtimeChannel | null>>();
let pruneTimer: ReturnType<typeof setInterval> | null = null;

function getPublisherSb(): SupabaseClient<any> | null {
  if (publisherSb) return publisherSb;
  try {
    publisherSb = getSupabaseServer();
    return publisherSb;
  } catch {
    return null;
  }
}

function waitForChannelSubscribed(
  sb: SupabaseClient<any>,
  ch: ReturnType<SupabaseClient<any>["channel"]>,
  timeoutMs: number
): Promise<void> {
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
      reject(new Error("cm_room_bump_server_channel_timeout"));
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
        reject(new Error(`cm_room_bump_server_channel_${status}`));
      }
    });
  });
}

function schedulePrune(): void {
  if (pruneTimer != null) return;
  pruneTimer = setInterval(() => {
    const sb = publisherSb;
    if (!sb) return;
    const now = Date.now();
    for (const [rid, entry] of roomChannels) {
      if (now - entry.lastUsed < IDLE_EVICT_MS) continue;
      try {
        void sb.removeChannel(entry.ch);
      } catch {
        /* ignore */
      }
      roomChannels.delete(rid);
    }
  }, PRUNE_EVERY_MS);
}

/**
 * 방 단위 Realtime 채널을 한 번 구독해 두고 재사용한다.
 * 동시에 같은 방에 대한 첫 구독만 직렬화한다.
 */
async function acquireRoomBumpChannel(roomId: string): Promise<RealtimeChannel | null> {
  const rid = roomId.trim();
  if (!rid) return null;

  const existing = roomChannels.get(rid);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.ch;
  }

  const inflight = roomSubscribeLocks.get(rid);
  if (inflight) {
    return inflight;
  }

  const task = (async (): Promise<RealtimeChannel | null> => {
    const sb = getPublisherSb();
    if (!sb) return null;

    const again = roomChannels.get(rid);
    if (again) {
      again.lastUsed = Date.now();
      return again.ch;
    }

    const ch = sb.channel(communityMessengerRoomBumpChannelName(rid), { config: { broadcast: { ack: false } } });
    try {
      await waitForChannelSubscribed(sb, ch, 8000);
      roomChannels.set(rid, { ch, lastUsed: Date.now() });
      schedulePrune();
      return ch;
    } catch {
      try {
        void sb.removeChannel(ch);
      } catch {
        /* ignore */
      }
      return null;
    }
  })().finally(() => {
    roomSubscribeLocks.delete(rid);
  });

  roomSubscribeLocks.set(rid, task);
  return task;
}

/**
 * 메시지가 서버에서 확정된 직후 — 서비스 롤 Realtime 로 상대 클라이언트에 bump 전달.
 * (postgres_changes publication 이 없거나 느릴 때도 UI 가 따라잡게 하는 **영속 보강 경로**)
 */
export async function publishCommunityMessengerRoomBumpFromServer(args: {
  roomId: string;
  fromUserId: string;
}): Promise<void> {
  const roomId = args.roomId.trim();
  const fromUserId = args.fromUserId.trim();
  if (!roomId || !fromUserId) return;

  const ch = await acquireRoomBumpChannel(roomId);
  if (!ch) return;

  try {
    await ch.send({
      type: "broadcast",
      event: CM_ROOM_BUMP_BROADCAST_EVENT,
      payload: {
        roomId,
        fromUserId,
        at: new Date().toISOString(),
      },
    });
    const hit = roomChannels.get(roomId);
    if (hit) hit.lastUsed = Date.now();
  } catch {
    const sb = publisherSb;
    const hit = roomChannels.get(roomId);
    if (hit && sb) {
      try {
        void sb.removeChannel(hit.ch);
      } catch {
        /* ignore */
      }
      roomChannels.delete(roomId);
    }
  }
}
