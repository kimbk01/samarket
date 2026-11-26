"use client";

import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";
import type { CmRoomRouteChunkWarmSource } from "@/lib/community-messenger/room/cm-room-route-chunk-warm";

/**
 * 감사 2026-11-26 D2·D2-R (`docs/audit/os-cover-push-entry-delay-audit-2026-11-26.md`) — 시작 목적지가 채팅방일 때
 * 채팅방 JS 예열 + 채팅방 데이터를 게이트와 **같은 함수·같은 단일 비행 키**(`fetchCommunityMessengerRoomBootstrapClient`)로 앞당겨 받는다.
 * 게이트는 진행 중 요청에 합류하거나 받아 둔 값을 쓴다 → 요청 수는 늘지 않는다(게이트가 어차피 보낼 1건을 앞당김).
 *
 * - D2: 알림 탭으로 켠 실행(`LaunchPushRoomPrefetch`).
 * - D2-R: 직전 화면 복원(`LifecycleRouteEffects` — `router.replace` 직전, 실제로 이동할 때만).
 * 채팅방 경로가 아니면 무동작. 문서당 같은 방은 1회. 모듈은 동적 import(홈 첫 JS 무변경).
 * 반환 = 시작했는가.
 */
const started = new Set<string>();

export function prefetchLaunchRoomEntry(path: string | null | undefined, source: CmRoomRouteChunkWarmSource): boolean {
  if (typeof window === "undefined") return false;
  const roomId = parseCommunityMessengerRoomIdFromPathname(path);
  if (!roomId || started.has(roomId)) return false;
  started.add(roomId);
  void Promise.all([
    import("@/lib/community-messenger/room/cm-room-route-chunk-warm"),
    import("@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client"),
  ])
    .then(([warm, room]) => {
      warm.warmCommunityMessengerRoomRouteChunks(source);
      return room.fetchCommunityMessengerRoomBootstrapClient(roomId);
    })
    .catch(() => {
      /* 게이트가 평소대로 다시 받는다 */
    });
  return true;
}

/** Tests only. */
export function __resetLaunchRoomPrefetchForTests(): void {
  started.clear();
}
