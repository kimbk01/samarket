"use client";

import type { RefObject } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";

/** 메신저 방 메시지 뷰포트 스크롤 기준 가상화 — 옵션은 기존 `CommunityMessengerRoomClient` 와 동일 */
export function useMessengerRoomChatVirtualizer(
  messageCount: number,
  scrollParentRef: RefObject<HTMLDivElement | null>
): Virtualizer<HTMLDivElement, Element> {
  return useVirtualizer({
    count: messageCount,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 96,
    overscan: 12,
  });
}
