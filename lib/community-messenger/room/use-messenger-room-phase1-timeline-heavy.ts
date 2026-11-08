"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, type MutableRefObject, type RefObject } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MESSENGER_TIMELINE_VIRTUAL_OVERSCAN } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { estimateMessengerTimelineRowPx } from "@/lib/store-order-chat/messenger-timeline-row-estimate";
import { useMessengerRoomDerivedMessageLists } from "@/lib/community-messenger/room/use-messenger-room-derived-message-lists";
import { useMessengerRoomTradeDockScrollAnchor } from "@/lib/community-messenger/room/use-messenger-room-trade-dock-scroll-anchor";
import { useMessengerRoomStoreOrderDockScrollAnchor } from "@/lib/community-messenger/room/use-messenger-room-store-order-dock-scroll-anchor";
import { messengerTimelineVirtualRowKey } from "@/components/community-messenger/room/community-messenger-room-helpers";

type RoomMsg = CommunityMessengerMessage & { pending?: boolean };

export type MessengerRoomPhase1TimelineHeavyBundle = {
  messageSearchResults: ReturnType<typeof useMessengerRoomDerivedMessageLists>["messageSearchResults"];
  mediaGalleryMessages: ReturnType<typeof useMessengerRoomDerivedMessageLists>["mediaGalleryMessages"];
  linkThreadMessages: ReturnType<typeof useMessengerRoomDerivedMessageLists>["linkThreadMessages"];
  displayRoomMessages: ReturnType<typeof useMessengerRoomDerivedMessageLists>["displayRoomMessages"];
  fileMessages: ReturnType<typeof useMessengerRoomDerivedMessageLists>["fileMessages"];
  managementEventMessages: ReturnType<typeof useMessengerRoomDerivedMessageLists>["managementEventMessages"];
  photoMessageCount: number;
  voiceMessageCount: number;
  fileMessageCount: number;
  linkMessageCount: number;
  chatVirtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, Element>>;
};

export function useMessengerRoomPhase1TimelineHeavy({
  roomId,
  roomMessages,
  hiddenCallStubIds,
  roomSearchQuery,
  messagesViewportRef,
  tradeDockScrollAnchorEnabled,
  storeOrderDockScrollAnchorEnabled,
  messageEndRef,
  stickToBottomRef,
  scrollMessengerToBottomRef,
}: {
  roomId: string;
  roomMessages: RoomMsg[];
  hiddenCallStubIds: Set<string>;
  roomSearchQuery: string;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  tradeDockScrollAnchorEnabled: boolean;
  storeOrderDockScrollAnchorEnabled: boolean;
  messageEndRef: RefObject<HTMLDivElement | null>;
  stickToBottomRef: MutableRefObject<boolean>;
  scrollMessengerToBottomRef: MutableRefObject<
    (req?: { reason?: string; force?: boolean }) => void
  >;
}): MessengerRoomPhase1TimelineHeavyBundle {
  const derived = useMessengerRoomDerivedMessageLists(roomMessages, hiddenCallStubIds, roomSearchQuery);
  const { displayRoomMessages } = derived;

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

  return useMemo(
    () => ({
      ...derived,
      chatVirtualizer,
    }),
    [derived, chatVirtualizer]
  );
}
