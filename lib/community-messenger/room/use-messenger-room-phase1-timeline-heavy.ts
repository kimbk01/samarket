"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, type RefObject } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { MESSENGER_TIMELINE_VIRTUAL_OVERSCAN } from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { estimateMessengerTimelineRowPx } from "@/lib/store-order-chat/messenger-timeline-row-estimate";
import { useMessengerRoomDerivedMessageLists } from "@/lib/community-messenger/room/use-messenger-room-derived-message-lists";
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
  roomMessages,
  hiddenCallStubIds,
  roomSearchQuery,
  messagesViewportRef,
}: {
  roomId?: string;
  roomMessages: RoomMsg[];
  hiddenCallStubIds: Set<string>;
  roomSearchQuery: string;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  /** @deprecated dock scroll anchors removed — chrome sync → useChatThreadScroll */
  tradeDockScrollAnchorEnabled?: boolean;
  storeOrderDockScrollAnchorEnabled?: boolean;
  messageEndRef?: RefObject<HTMLDivElement | null>;
  stickToBottomRef?: unknown;
  scrollMessengerToBottomRef?: unknown;
}): MessengerRoomPhase1TimelineHeavyBundle {
  const derived = useMessengerRoomDerivedMessageLists(roomMessages, hiddenCallStubIds, roomSearchQuery);
  const { displayRoomMessages } = derived;

  const chatVirtualizer = useVirtualizer({
    count: displayRoomMessages.length,
    getScrollElement: () => messagesViewportRef.current,
    estimateSize: (index) => estimateMessengerTimelineRowPx(displayRoomMessages[index]),
    overscan: MESSENGER_TIMELINE_VIRTUAL_OVERSCAN,
    getItemKey: (index) =>
      messengerTimelineVirtualRowKey(displayRoomMessages[index]) || `__cm_timeline_${index}`,
  });

  return useMemo(
    () => ({
      ...derived,
      chatVirtualizer,
    }),
    [derived, chatVirtualizer]
  );
}
