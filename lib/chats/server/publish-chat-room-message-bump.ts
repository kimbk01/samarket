import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import {
  CHAT_ROOM_MESSAGE_BUMP_EVENT,
  chatRoomRealtimeChannelName,
  type ChatRealtimeMode,
} from "@/lib/chats/realtime/chat-room-realtime-channel";

type ChannelEntry = { ch: RealtimeChannel; lastUsed: number };

const IDLE_EVICT_MS = 120_000;
const PRUNE_EVERY_MS = 30_000;
const channelEntries = new Map<string, ChannelEntry>();
const channelLocks = new Map<string, Promise<RealtimeChannel | null>>();
let pruneTimer: ReturnType<typeof setInterval> | null = null;

function waitForSubscribed(
  sb: SupabaseClient<any>,
  ch: ReturnType<SupabaseClient<any>["channel"]>,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      void sb.removeChannel(ch).catch(() => undefined);
      reject(new Error("chat_room_bump_channel_timeout"));
    }, timeoutMs);
    ch.subscribe((status) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        clearTimeout(timer);
        resolve();
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        clearTimeout(timer);
        void sb.removeChannel(ch).catch(() => undefined);
        reject(new Error(`chat_room_bump_channel_${status}`));
      }
    });
  });
}

function schedulePrune(sb: SupabaseClient<any>): void {
  if (pruneTimer != null) return;
  pruneTimer = setInterval(() => {
    if (channelEntries.size === 0) {
      if (pruneTimer != null) {
        clearInterval(pruneTimer);
        pruneTimer = null;
      }
      return;
    }
    const now = Date.now();
    for (const [key, entry] of channelEntries) {
      if (now - entry.lastUsed < IDLE_EVICT_MS) continue;
      void sb.removeChannel(entry.ch).catch(() => undefined);
      channelEntries.delete(key);
    }
  }, PRUNE_EVERY_MS);
}

async function acquireChannel(
  sb: SupabaseClient<any>,
  mode: ChatRealtimeMode,
  roomId: string
): Promise<RealtimeChannel | null> {
  const rid = roomId.trim();
  if (!rid) return null;
  const key = `${mode}:${rid}`;
  const existing = channelEntries.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.ch;
  }
  const inflight = channelLocks.get(key);
  if (inflight) return inflight;

  const task = (async () => {
    const again = channelEntries.get(key);
    if (again) {
      again.lastUsed = Date.now();
      return again.ch;
    }
    const ch = sb.channel(chatRoomRealtimeChannelName(mode, rid), { config: { broadcast: { ack: false } } });
    try {
      await waitForSubscribed(sb, ch, 5000);
      channelEntries.set(key, { ch, lastUsed: Date.now() });
      schedulePrune(sb);
      return ch;
    } catch {
      void sb.removeChannel(ch).catch(() => undefined);
      return null;
    }
  })().finally(() => {
    channelLocks.delete(key);
  });

  channelLocks.set(key, task);
  return task;
}

export async function publishChatRoomMessageBumpFromServer(
  sb: SupabaseClient<any>,
  args: {
    mode: ChatRealtimeMode;
    roomId: string;
    row: Record<string, unknown>;
  }
): Promise<void> {
  const roomId = args.roomId.trim();
  if (!roomId || !args.row || typeof args.row !== "object") return;
  const ch = await acquireChannel(sb, args.mode, roomId);
  if (!ch) return;
  try {
    await ch.send({
      type: "broadcast",
      event: CHAT_ROOM_MESSAGE_BUMP_EVENT,
      payload: {
        v: 1,
        mode: args.mode,
        roomId,
        row: args.row,
        at: new Date().toISOString(),
      },
    });
    const hit = channelEntries.get(`${args.mode}:${roomId}`);
    if (hit) hit.lastUsed = Date.now();
  } catch {
    const hit = channelEntries.get(`${args.mode}:${roomId}`);
    if (hit) {
      void sb.removeChannel(hit.ch).catch(() => undefined);
      channelEntries.delete(`${args.mode}:${roomId}`);
    }
  }
}
