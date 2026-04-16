"use client";

/**
 * 방 메시지 실시간 갱신을 위한 Supabase Realtime **Broadcast**.
 *
 * - 목적: `postgres_changes`(publication/RLS/세션 레이스)에 의존하지 않고
 *   “새 메시지 있음” 신호를 즉시 전달.
 * - 보안: 페이로드는 신뢰하지 않고(스푸핑 가능), 수신 측은 항상 인증된 HTTP로 증분 동기화한다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isCommunityMessengerRealtimeDebugEnabled } from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import {
  CM_ROOM_BUMP_BROADCAST_EVENT,
  communityMessengerRoomBumpChannelName,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";

function waitForChannelSubscribed(ch: ReturnType<SupabaseClient["channel"]>, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("cm_room_bump_channel_timeout"));
    }, timeoutMs);
    ch.subscribe((status) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        window.clearTimeout(t);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        window.clearTimeout(t);
        reject(new Error(`cm_room_bump_channel_${status}`));
      }
    });
  });
}

export async function publishCommunityMessengerRoomBump(
  sb: SupabaseClient,
  args: { roomId: string; fromUserId?: string | null; atIso?: string }
): Promise<void> {
  const roomId = args.roomId.trim();
  if (!roomId) return;
  const ch = sb.channel(communityMessengerRoomBumpChannelName(roomId), { config: { broadcast: { ack: false } } });
  try {
    await waitForChannelSubscribed(ch, 3500);
    if (isCommunityMessengerRealtimeDebugEnabled()) {
      // eslint-disable-next-line no-console -- dev-only
      console.info("[cm-rt]", "room_bump_send", { roomId, fromUserId: args.fromUserId ?? null });
    }
    await ch.send({
      type: "broadcast",
      event: CM_ROOM_BUMP_BROADCAST_EVENT,
      payload: {
        roomId,
        fromUserId: typeof args.fromUserId === "string" ? args.fromUserId.trim() : "",
        at: args.atIso ?? new Date().toISOString(),
      },
    });
  } finally {
    try {
      void sb.removeChannel(ch);
    } catch {
      /* ignore */
    }
  }
}

export async function publishCommunityMessengerRoomBumpBestEffort(args: {
  roomId: string;
  fromUserId?: string | null;
}): Promise<void> {
  const roomId = args.roomId.trim();
  if (!roomId) return;
  const sb = getSupabaseClient();
  if (!sb) return;
  try {
    await publishCommunityMessengerRoomBump(sb, { roomId, fromUserId: args.fromUserId ?? null });
  } catch {
    /* best-effort */
  }
}

export function subscribeCommunityMessengerRoomBumpBroadcast(args: {
  sb: SupabaseClient;
  roomId: string;
  onBump: (payload: Record<string, unknown>) => void;
}): ReturnType<SupabaseClient["channel"]> {
  const roomId = args.roomId.trim();
  const name = communityMessengerRoomBumpChannelName(roomId);
  return args.sb
    .channel(name, { config: { broadcast: { ack: false } } })
    .on("broadcast", { event: CM_ROOM_BUMP_BROADCAST_EVENT }, (msg) => {
      const raw = (msg as { payload?: unknown }).payload;
      if (isCommunityMessengerRealtimeDebugEnabled()) {
        // eslint-disable-next-line no-console -- dev-only
        console.info("[cm-rt]", "room_bump_recv", { roomId, payload: raw ?? null });
      }
      args.onBump(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});
    })
    .subscribe();
}

