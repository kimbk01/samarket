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
 *
 * `messageId`·`messageCreatedAt`·선택 `message` 는 **저지연 힌트(v2)** — 수신 측은 `message` 를
 * `fromUserId`·canonical 방 id 와 교차 검증한 뒤 즉시 병합할 수 있고, 이후 HTTP 로 정합을 맞출 수 있다.
 */
export async function publishCommunityMessengerRoomBumpFromServer(args: {
  /** Realtime 채널 접미사(구독 키). canonical 과 거래·레거시 URL id 가 다르면 둘 다 쓸 수 있다. */
  channelRoomId: string;
  canonicalRoomId: string;
  fromUserId: string;
  messageId?: string;
  messageCreatedAt?: string;
  /** canonical 과 다른 라우트 id — 수신 측 매칭·거래 URL 구독용 */
  rawRouteRoomId?: string | null;
  /** 서비스 롤 전용 — 클라 broadcast 와 혼동되므로 수신 측에서 반드시 검증 */
  messageSnapshot?: Record<string, unknown> | null;
}): Promise<void> {
  const channelKey = args.channelRoomId.trim();
  const canonicalRoomId = args.canonicalRoomId.trim();
  const fromUserId = args.fromUserId.trim();
  if (!channelKey || !canonicalRoomId || !fromUserId) return;

  const ch = await acquireRoomBumpChannel(channelKey);
  if (!ch) return;

  const messageId = typeof args.messageId === "string" ? args.messageId.trim() : "";
  const messageCreatedAt = typeof args.messageCreatedAt === "string" ? args.messageCreatedAt.trim() : "";
  const rawTagged = typeof args.rawRouteRoomId === "string" ? args.rawRouteRoomId.trim() : "";
  const payload: Record<string, unknown> = {
    v: 2,
    roomId: canonicalRoomId,
    canonicalRoomId,
    fromUserId,
    at: new Date().toISOString(),
  };
  if (rawTagged && rawTagged.toLowerCase() !== canonicalRoomId.toLowerCase()) {
    payload.rawRouteRoomId = rawTagged;
  }
  if (messageId) {
    payload.messageId = messageId;
    if (messageCreatedAt) payload.messageCreatedAt = messageCreatedAt;
  }
  const snap = args.messageSnapshot;
  if (snap && typeof snap === "object" && snap !== null && Object.keys(snap).length > 0) {
    payload.message = snap;
  }

  try {
    await ch.send({
      type: "broadcast",
      event: CM_ROOM_BUMP_BROADCAST_EVENT,
      payload,
    });
    const hit = roomChannels.get(channelKey);
    if (hit) hit.lastUsed = Date.now();
  } catch {
    const sb = publisherSb;
    const hit = roomChannels.get(channelKey);
    if (hit && sb) {
      try {
        void sb.removeChannel(hit.ch);
      } catch {
        /* ignore */
      }
      roomChannels.delete(channelKey);
    }
  }
}
