"use client";

import type { MutableRefObject, RefObject } from "react";
import type { Virtualizer } from "@tanstack/react-virtual";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";
import { useMessengerRoomScrollAnchorController } from "@/lib/community-messenger/room/messenger-room-scroll-anchor-controller";

type VirtualizerLike = Pick<Virtualizer<HTMLDivElement, Element>, "scrollToIndex">;

/**
 * @see docs/community-messenger-mobile-room-viewport.md
 *
 * ScrollAnchorController thin wrapper — phase1 hook 호출 순서 유지.
 */
export function useMessengerRoomReaderScrollBottom({
  roomId,
  activeSheet,
  stickToBottomRef,
  messagesViewportRef,
  messageEndRef,
  roomMessages,
  virtualizer,
  messageCount,
  deferEntryScrollToDeliveryDirectTimeline = false,
}: {
  roomId: string;
  activeSheet:
    | null
    | "attach"
    | "attach-confirm"
    | "menu"
    | "members"
    | "info"
    | "search"
    | "media"
    | "files"
    | "links"
    | "stickers"
    | "emoji";
  stickToBottomRef: MutableRefObject<boolean>;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  messageEndRef: RefObject<HTMLDivElement | null>;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
  virtualizer?: VirtualizerLike;
  messageCount?: number;
  deferEntryScrollToDeliveryDirectTimeline?: boolean;
}): {
  scrollMessengerToBottom: (opts?: { reason?: string }) => void;
  updateStickToBottomFromScroll: () => void;
} {
  void messageEndRef;
  const controller = useMessengerRoomScrollAnchorController({
    roomId,
    activeSheet,
    stickToBottomRef,
    messagesViewportRef,
    messageEndRef,
    roomMessages,
    virtualizer,
    messageCount: messageCount ?? roomMessages.length,
    deferEntryScrollToDeliveryDirectTimeline,
  });

  return {
    scrollMessengerToBottom: controller.scrollMessengerToBottom,
    updateStickToBottomFromScroll: controller.updateStickToBottomFromScroll,
  };
}
