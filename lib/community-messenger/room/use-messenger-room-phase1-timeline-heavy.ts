"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import type { MutableRefObject, RefObject } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MESSENGER_TIMELINE_VIRTUAL_OVERSCAN } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { estimateMessengerTimelineRowPx } from "@/lib/store-order-chat/messenger-timeline-row-estimate";
import { useMessengerRoomTradeDockScrollAnchor } from "@/lib/community-messenger/room/use-messenger-room-trade-dock-scroll-anchor";
import { useMessengerRoomStoreOrderDockScrollAnchor } from "@/lib/community-messenger/room/use-messenger-room-store-order-dock-scroll-anchor";
import { messengerTimelineVirtualRowKey } from "@/components/community-messenger/room/community-messenger-room-helpers";

type RoomMsg = CommunityMessengerMessage & { pending?: boolean };

export type MessengerRoomTimelineVirtualizer = ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;

/**
 * 채팅 P0-1 (Owner 「채팅 P0 승인」 2026-11-11): 이 훅은 virtualizer 만 만든다(인스턴스는 방마다 1개로 고정).
 * 파생 목록(표시·검색·갤러리)은 `use-messenger-room-client-phase1` 이 같은 렌더에서 계산한다 —
 * 예전에는 여기서 계산해 layoutEffect 로 부모 state 에 다시 넣어, 메시지가 바뀔 때마다 방 전체가 2번 렌더됐다(실측).
 */
export function useMessengerRoomPhase1TimelineHeavy({
  roomId,
  displayRoomMessages,
  messagesViewportRef,
  tradeDockScrollAnchorEnabled,
  storeOrderDockScrollAnchorEnabled,
  messageEndRef,
  stickToBottomRef,
  scrollMessengerToBottomRef,
}: {
  roomId: string;
  displayRoomMessages: RoomMsg[];
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  tradeDockScrollAnchorEnabled: boolean;
  storeOrderDockScrollAnchorEnabled: boolean;
  messageEndRef: RefObject<HTMLDivElement | null>;
  stickToBottomRef: MutableRefObject<boolean>;
  scrollMessengerToBottomRef: MutableRefObject<
    (req?: { reason?: string; force?: boolean }) => void
  >;
}): MessengerRoomTimelineVirtualizer {
  const chatVirtualizer = useVirtualizer({
    count: displayRoomMessages.length,
    getScrollElement: () => messagesViewportRef.current,
    /**
     * D5-R4 (Owner 「D5 구현」 2026-11-09): 가상 스크롤이 켜지는 순간(`_willUpdate`) 대화 상자를 이 값으로 이동시킨다.
     * 기본값 0 이면 진입 정책이 이미 맞춘 위치(맨 아래·첫 안 읽음·돌아옴)를 맨 위로 되돌렸다
     * (운영 실측: 그룹방 첫 진입 맨 아래 → 0 → 맨 아래 튐). 현재 위치를 넘겨 이동이 없게 한다.
     */
    initialOffset: () => messagesViewportRef.current?.scrollTop ?? 0,
    estimateSize: (index) => estimateMessengerTimelineRowPx(displayRoomMessages[index]),
    overscan: MESSENGER_TIMELINE_VIRTUAL_OVERSCAN,
    getItemKey: (index) =>
      messengerTimelineVirtualRowKey(displayRoomMessages[index]) || `__cm_timeline_${index}`,
  });

  useMessengerRoomTradeDockScrollAnchor({
    enabled: tradeDockScrollAnchorEnabled,
    roomId,
    messagesViewportRef,
    messageEndRef,
    messageCount: displayRoomMessages.length,
    stickToBottomRef,
    scrollMessengerToBottomRef,
  });

  useMessengerRoomStoreOrderDockScrollAnchor({
    enabled: storeOrderDockScrollAnchorEnabled,
    roomId,
    messagesViewportRef,
    messageEndRef,
    messageCount: displayRoomMessages.length,
    stickToBottomRef,
    scrollMessengerToBottomRef,
  });

  return chatVirtualizer;
}
