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
  messengerPrivateBroadcastChannelOptions,
  primeMessengerPrivateRealtimeAuth,
} from "@/lib/community-messenger/realtime/private-broadcast-client";
import { superviseMessengerChannel } from "@/lib/community-messenger/realtime/messenger-realtime-supervisor";
import type { SubscribeWithRetryHandle } from "@/lib/community-messenger/realtime/cm-rt-channel-registry";

/**
 * 결함 2(2026-11-27 iPhone 실기): 직접 `subscribe()` 는 가입 실패 때 라이브러리가 10초마다 끝없이 재가입했다.
 * 감독 입구(`superviseMessengerChannel`)로 가입 — 차단기·대기·오프라인 일시정지. 수신 페이로드·검증·병합은 그대로.
 * 재연결 때 스스로 다시 읽기는 지금처럼 없다(R2 note 도 부르지 않음 — 이 채널 하나가 흔들릴 때 요청 증가, 독립 검토 7번).
 * 열린 방의 재연결 따라잡기는 방 묶음 채널이 R2 로 한다.
 * 설계 docs/audit/supabase-request-surge-2026-11-18/rt-bundle-gen-skip-and-unsupervised-channels-design-2026-11-27.md §3
 */
export function subscribeCommunityMessengerRoomBumpBroadcast(args: {
  sb: SupabaseClient;
  roomId: string;
  onBump: (payload: Record<string, unknown>) => void;
  /** 선택: 구독 상태 콜백(SUBSCRIBED 시 공백 보상 정합 등) */
  onStatus?: (status: string) => void;
  /** 호출부가 해제했는지 — 해제 뒤 재시도 금지 */
  isCancelled: () => boolean;
}): SubscribeWithRetryHandle {
  const roomId = args.roomId.trim();
  const name = communityMessengerRoomBumpChannelName(roomId);
  primeMessengerPrivateRealtimeAuth(args.sb);
  return superviseMessengerChannel({
    sb: args.sb,
    name,
    logStreamRoomId: roomId,
    scope: "room_bump",
    channelOptions: messengerPrivateBroadcastChannelOptions(),
    isCancelled: args.isCancelled,
    onStatus: (status) => {
      try {
        args.onStatus?.(status);
      } catch {
        /* 호출부 오류가 실시간을 멈추지 않게 */
      }
    },
    build: (ch) =>
      ch.on("broadcast", { event: CM_ROOM_BUMP_BROADCAST_EVENT }, (msg) => {
        const raw = (msg as { payload?: unknown }).payload;
        if (isCommunityMessengerRealtimeDebugEnabled()) {
          // eslint-disable-next-line no-console -- dev-only
          console.info("[cm-rt]", "room_bump_recv", { roomId, payload: raw ?? null });
        }
        args.onBump(typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {});
      }),
  });
}
