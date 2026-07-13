"use client";

import { postCommunityMessengerBusEvent } from "@/lib/community-messenger/multi-tab-bus";

/**
 * 방 안 친구 요청 수락/거절 후 — Home 동기화 트리거.
 *
 * W10 격리 (Runtime 증명 `W10_RUNTIME_EQUIVALENCE_CONFIRMED` — `.qa-logs/cm-w10-runtime-equivalence.json`):
 * 여기서는 `cm.home.social_sync` bus 만 발행한다.
 * - Home 마운트 시: W3(`CommunityMessengerHome` 리스너 → `refresh(true)` → `mergeHomeSyncIntoBootstrap`)가
 *   home-sync fetch / merge / cache prime 를 담당한다.
 * - Home 미마운트 시: Home 재진입 refresh 가 최종 catch-up 을 담당한다.
 * - Multi-tab: 다른 탭 Home 이 BroadcastChannel `social_sync` 를 받아 W3 로 반영한다.
 *
 * CONTRACT / DO NOT: 과거처럼 이 함수에서 `home-sync?fresh=1&tier=full` + `bootstrap?fresh=1` 을 직접 호출해
 * bootstrap cache 에 `partial_upsert` 하지 말 것 (W3 와 중복된 network/cache writer 였다 — W10).
 * bus 발행은 반드시 유지한다. W3/W5/W9·Canonical 분류·home-sync 계약은 이 격리와 무관하다.
 */
export async function refreshMessengerHomeSocialClient(
  _trigger: "room_friend_request_outcome" = "room_friend_request_outcome"
): Promise<boolean> {
  postCommunityMessengerBusEvent({ type: "cm.home.social_sync", at: Date.now() });
  return true;
}
