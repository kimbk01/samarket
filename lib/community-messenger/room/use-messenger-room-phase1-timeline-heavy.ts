"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, type MutableRefObject, type RefObject } from "react";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import {
  MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX,
  MESSENGER_TIMELINE_VIRTUAL_OVERSCAN,
} from "@/lib/community-messenger/room/messenger-room-ui-constants";
import { useMessengerRoomDerivedMessageLists } from "@/lib/community-messenger/room/use-messenger-room-derived-message-lists";
import { useMessengerRoomTradeDockScrollAnchor } from "@/lib/community-messenger/room/use-messenger-room-trade-dock-scroll-anchor";

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
  tradeDockScrollAnchorEnabled,
  messageEndRef,
  stickToBottomRef,
}: {
  roomMessages: RoomMsg[];
  hiddenCallStubIds: Set<string>;
  roomSearchQuery: string;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  tradeDockScrollAnchorEnabled: boolean;
  messageEndRef: RefObject<HTMLDivElement | null>;
  stickToBottomRef: MutableRefObject<boolean>;
}): MessengerRoomPhase1TimelineHeavyBundle {
  const derived = useMessengerRoomDerivedMessageLists(roomMessages, hiddenCallStubIds, roomSearchQuery);
  const { displayRoomMessages } = derived;

  const chatVirtualizer = useVirtualizer({
    count: displayRoomMessages.length,
    getScrollElement: () => messagesViewportRef.current,
    estimateSize: () => MESSENGER_TIMELINE_VIRTUAL_ESTIMATE_PX,
    overscan: MESSENGER_TIMELINE_VIRTUAL_OVERSCAN,
    getItemKey: (index) => displayRoomMessages[index]?.id ?? `__cm_timeline_${index}`,
  });

  useMessengerRoomTradeDockScrollAnchor({
    enabled: tradeDockScrollAnchorEnabled,
    messagesViewportRef,
    messageEndRef,
    virtualizer: chatVirtualizer,
    messageCount: displayRoomMessages.length,
    stickToBottomRef,
  });

  return useMemo(
    () => ({
      ...derived,
      chatVirtualizer,
    }),
    [derived, chatVirtualizer]
  );
}
