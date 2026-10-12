"use client";

/**
 * Community 메신저 **방 단위 Realtime Broadcast 수신**만 담당한다.
 *
 * **발행( bump )은 서버 전용** — `lib/community-messenger/server/publish-messenger-room-bump.ts` →
 * `publishCommunityMessengerRoomBumpFromServer` (서비스 롤). 클라이언트에서 동일 채널로 bump 를
 * 쏘지 않는다(중복·지연·스푸핑 면에서 제거됨).
 *
 * 계약 요약: v2 페이로드 + 선택 `message` 스냅샷 — 수신·검증·병합은
 * `community-messenger-room-bump-message-snapshot.ts` 및 `use-messenger-room-client-phase1` 참고.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommunityMessengerRealtimeDebugEnabled } from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import {
  CM_ROOM_BUMP_BROADCAST_EVENT,
  communityMessengerRoomBumpChannelName,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";

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
