import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  CM_CONVERSATION_UPSERT_BROADCAST_EVENT,
  communityMessengerConversationUpsertChannelName,
  type ConversationUpsertBroadcastPayload,
} from "@/lib/community-messenger/conversation-engine/conversation-upsert-channel";

const IDLE_EVICT_MS = 120_000;
const PRUNE_EVERY_MS = 30_000;

type RoomEntry = { ch: RealtimeChannel; lastUsed: number };

let publisherSb: SupabaseClient | null = null;
const roomChannels = new Map<string, RoomEntry>();
const roomSubscribeLocks = new Map<string, Promise<RealtimeChannel | null>>();
let pruneTimer: ReturnType<typeof setInterval> | null = null;

function getPublisherSb(): SupabaseClient | null {
  if (publisherSb) return publisherSb;
  try {
    publisherSb = getSupabaseServer();
    return publisherSb;
  } catch {
    return null;
  }
}

function waitForChannelSubscribed(
  sb: SupabaseClient,
  ch: ReturnType<SupabaseClient["channel"]>,
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
      reject(new Error("cm_conversation_upsert_server_channel_timeout"));
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
        reject(new Error(`cm_conversation_upsert_server_channel_${status}`));
      }
    });
  });
}

function schedulePrune(): void {
  if (pruneTimer != null) return;
  pruneTimer = setInterval(() => {
    const sb = publisherSb;
    if (roomChannels.size === 0) {
      if (pruneTimer != null) {
        clearInterval(pruneTimer);
        pruneTimer = null;
      }
      return;
    }
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
    if (roomChannels.size === 0 && pruneTimer != null) {
      clearInterval(pruneTimer);
      pruneTimer = null;
    }
  }, PRUNE_EVERY_MS);
}

async function acquireChannel(roomId: string): Promise<RealtimeChannel | null> {
  const rid = roomId.trim().toLowerCase();
  if (!rid) return null;
  const existing = roomChannels.get(rid);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.ch;
  }
  const inflight = roomSubscribeLocks.get(rid);
  if (inflight) return inflight;

  const task = (async (): Promise<RealtimeChannel | null> => {
    const sb = getPublisherSb();
    if (!sb) return null;
    const again = roomChannels.get(rid);
    if (again) {
      again.lastUsed = Date.now();
      return again.ch;
    }
    const ch = sb.channel(communityMessengerConversationUpsertChannelName(rid), {
      config: { broadcast: { ack: false } },
    });
    try {
      await waitForChannelSubscribed(sb, ch, 8_000);
      roomChannels.set(rid, { ch, lastUsed: Date.now() });
      schedulePrune();
      return ch;
    } catch {
      return null;
    }
  })();

  roomSubscribeLocks.set(rid, task);
  try {
    return await task;
  } finally {
    roomSubscribeLocks.delete(rid);
  }
}

export async function publishCommunityMessengerConversationUpsertFromServer(
  payload: ConversationUpsertBroadcastPayload
): Promise<void> {
  const roomId = String(payload.roomId || payload.canonicalRoomId || "").trim();
  if (!roomId || !payload.eventId) return;
  try {
    const ch = await acquireChannel(roomId);
    if (!ch) return;
    await ch.send({
      type: "broadcast",
      event: CM_CONVERSATION_UPSERT_BROADCAST_EVENT,
      payload,
    });
  } catch {
    /* best-effort */
  }
}
