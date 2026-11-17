"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getMessengerBottomChatUnreadAppliedServerSnapshot,
  hasMessengerBottomChatUnreadApplied,
  subscribeMessengerBottomChatUnread,
} from "@/lib/notifications/messenger-bottom-chat-unread-projection";
import { useLastRunSnapshot } from "@/hooks/use-last-run-snapshot";
import { updateLastRunSnapshot } from "@/lib/startup/last-run-snapshot";
import { getSyncViewerUserIdForClient } from "@/lib/auth/get-current-user";
import type { BottomNavIconKey } from "@/lib/main-menu/bottom-nav-config";

/**
 * 앱 진입 실기 F3-a (telRING 배지 약 +3.5초) — 하단 채팅(telRING) 탭 숫자.
 * 메신저 projection 에 이번 실행의 진짜 값이 들어오기 전에는 같은 계정의 지난 실행 숫자를 보이고(표시 씨앗 · store 에 넣지 않음),
 * 진짜 값이 들어오면 그 값을 쓰며 기록한다. 채팅 탭이 아니면 받은 숫자 그대로.
 */
export function useBottomNavChatBadgeWithLastRunSeed(icon: BottomNavIconKey, liveCount: number): number {
  const isChat = icon === "chat";
  const applied = useSyncExternalStore(
    subscribeMessengerBottomChatUnread,
    hasMessengerBottomChatUnreadApplied,
    getMessengerBottomChatUnreadAppliedServerSnapshot
  );
  const lastRun = useLastRunSnapshot();

  useEffect(() => {
    if (!isChat || !applied) return;
    updateLastRunSnapshot({ telringUnread: liveCount }, getSyncViewerUserIdForClient());
  }, [isChat, applied, liveCount]);

  if (!isChat || applied) return liveCount;
  return lastRun?.telringUnread ?? liveCount;
}
