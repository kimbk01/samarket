"use client";

import { useEffect } from "react";
import { restoreMessengerListWebBackAfterReload } from "@/lib/community-messenger/room/messenger-list-web-back";

/**
 * N1 D1 — 문서 reload 뒤 1회, 저장된 「목록 웹 뒤로 담당」 기록으로 구독·페이지 뒤로 주인을 되살린다.
 * 화면을 그리지 않고 통화·알림 이동 경로를 건드리지 않는다(`PushRouteListener` 와 별개).
 */
export function MessengerListWebBackRestore() {
  useEffect(() => {
    restoreMessengerListWebBackAfterReload();
  }, []);
  return null;
}
