"use client";

import { useEffect } from "react";
import { readLaunchPushTarget } from "@/lib/startup/launch-push-hold";
import { prefetchLaunchRoomEntry } from "@/lib/startup/launch-room-prefetch";

/**
 * 감사 2026-11-26 D2 (`docs/audit/os-cover-push-entry-delay-audit-2026-11-26.md`) — 알림 탭으로 켠 실행의 채팅방 미리 받기.
 *
 * 실측: 채팅방 데이터 요청이 알림 경로 결정 뒤 RSC → 채팅방 JS 물결 → 로그인 경계 → 게이트 마운트를 다 기다린 뒤에야 나갔다
 * (Samsung 1.13초 · Xiaomi 1.58초 늦음). 반영 뒤 Samsung 탭→덮개 걷힘 7.86·6.46 → 5.82·5.52초(§7-1).
 *
 * - 목적지는 Android 가 문서 시작 전에 저장한 값을 동기로 읽는다(`readLaunchPushTarget` — 네이티브 응답·hydration 대기 없음).
 * - 받는 방식은 `prefetchLaunchRoomEntry`(게이트와 같은 함수·같은 단일 비행 키).
 * - 통화 경로(`/community-messenger/calls`)는 `readLaunchPushTarget` 이 이미 null → 무동작. 통화 코드·알림 수신자(`PushRouteListener`) 무변경.
 * - 목적지 없음(아이콘 실행·iOS·웹) → 무동작.
 */
export function LaunchPushRoomPrefetch(): null {
  useEffect(() => {
    prefetchLaunchRoomEntry(readLaunchPushTarget(), "launch_push");
  }, []);
  return null;
}
