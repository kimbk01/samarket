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
 *
 * **비공개 토픽**: `config.private: true` — 수신은 `realtime.messages` SELECT 정책(방 접근 가능자)만.
 * 클라이언트 INSERT 정책 없음(발행 불가). JWT 는 `lib/supabase/client.ts` 의 `realtime.setAuth` 로 유지.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isCommunityMessengerRealtimeDebugEnabled } from "@/lib/community-messenger/realtime/community-messenger-realtime-debug";
import {
  CM_ROOM_BUMP_BROADCAST_EVENT,
  communityMessengerRoomBumpChannelName,
} from "@/lib/community-messenger/realtime/community-messenger-room-bump-channel";
import {
  createMessengerPrivateChannelStatusHandler,
  messengerPrivateBroadcastChannelOptions,
  primeMessengerPrivateRealtimeAuth,
} from "@/lib/community-messenger/realtime/private-broadcast-client";

export function subscribeCommunityMessengerRoomBumpBroadcast(args: {
  sb: SupabaseClient;
  roomId: string;
  onBump: (payload: Record<string, unknown>) => void;
  /** 채널 상태(SUBSCRIBED 재합류 감지 등) — realtime-js 는 rejoin 때도 같은 콜백을 부른다. */
  onStatus?: (status: string) => void;
}): ReturnType<SupabaseClient["channel"]> {
  const roomId = args.roomId.trim();
  const name = communityMessengerRoomBumpChannelName(roomId);
  primeMessengerPrivateRealtimeAuth(args.sb);
  return args.sb
    .channel(name, messengerPrivateBroadcastChannelOptions())
    .on("broadcast", { event: CM_ROOM_BUMP_BROADCAST_EVENT }, (msg) => {
      const raw = (msg as { payload?: unknown }).payload;
      if (isCommunityMessengerRealtimeDebugEnabled()) {
        // eslint-disable-next-line no-console -- dev-only
        console.info("[cm-rt]", "room_bump_recv", { roomId, payload: raw ?? null });
      }
      args.onBump(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});
    })
    .subscribe(
      createMessengerPrivateChannelStatusHandler({
        sb: args.sb,
        scope: "room_bump",
        onStatus: args.onStatus ? (status) => args.onStatus?.(String(status)) : undefined,
      })
    );
}
