"use client";

import { useLayoutEffect } from "react";
import { consumeCommunityMessengerHomeReturn } from "@/lib/community-messenger/home-return-timing";

/**
 * 방 → 메신저 홈 복귀 시 `room_to_list_mount` 계측: 스켈레톤·홈 셸이 커밋되는 시점(useLayoutEffect)에 소비.
 * 목록 데이터 fetch 완료와 무관.
 */
export function CommunityMessengerHomeReturnConsume(): null {
  useLayoutEffect(() => {
    consumeCommunityMessengerHomeReturn();
  }, []);
  return null;
}
