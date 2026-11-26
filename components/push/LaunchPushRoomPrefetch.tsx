"use client";

import { useEffect } from "react";
import { readLaunchPushTarget } from "@/lib/startup/launch-push-hold";
import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";

/**
 * 감사 2026-11-26 D2 (`docs/audit/os-cover-push-entry-delay-audit-2026-11-26.md`) — 알림 탭으로 켠 실행의 채팅방 미리 받기.
 *
 * 실측: 채팅방 데이터 요청이 알림 경로 결정 뒤 RSC → 채팅방 JS 물결 → 로그인 경계 → 게이트 마운트를 다 기다린 뒤에야 나갔다
 * (Samsung 1.13초 · Xiaomi 1.58초 늦음). 목록에서 방에 들어갈 때는 미리 받는데 알림 진입만 빠져 있었다.
 *
 * - 목적지는 Android 가 문서 시작 전에 저장한 값을 동기로 읽는다(`readLaunchPushTarget` — 네이티브 응답·hydration 대기 없음).
 * - 데이터는 게이트와 **같은 함수·같은 단일 비행 키**(`fetchCommunityMessengerRoomBootstrapClient`)로 받는다 → 게이트가 진행 중
 *   요청에 합류하거나 받아 둔 값을 쓴다. 요청 수는 늘지 않는다(게이트가 어차피 보낼 1건을 앞당김).
 * - 통화 경로(`/community-messenger/calls`)는 `readLaunchPushTarget` 이 이미 null → 무동작. 통화 코드·알림 수신자(`PushRouteListener`) 무변경.
 * - 목적지 없음(아이콘 실행·iOS·웹) → 무동작.
 */
let started = false;

export function LaunchPushRoomPrefetch(): null {
  useEffect(() => {
    if (started) return;
    const target = readLaunchPushTarget();
    const roomId = parseCommunityMessengerRoomIdFromPathname(target);
    if (!roomId) return;
    started = true;
    void Promise.all([
      import("@/lib/community-messenger/room/cm-room-route-chunk-warm"),
      import("@/lib/community-messenger/room/fetch-community-messenger-room-bootstrap-client"),
    ])
      .then(([warm, room]) => {
        warm.warmCommunityMessengerRoomRouteChunks("launch_push");
        return room.fetchCommunityMessengerRoomBootstrapClient(roomId);
      })
      .catch(() => {
        /* 게이트가 평소대로 다시 받는다 */
      });
  }, []);
  return null;
}

/** Tests only. */
export function __resetLaunchPushRoomPrefetchForTests(): void {
  started = false;
}
