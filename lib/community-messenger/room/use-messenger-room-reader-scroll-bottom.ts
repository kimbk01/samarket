"use client";

import { useCallback, useEffect, type MutableRefObject, type RefObject } from "react";
import type { MessengerChatViewPosition } from "@/lib/community-messenger/notifications/messenger-notification-state-model";
import { messengerRolloutUsesRoomScrollHints } from "@/lib/community-messenger/notifications/messenger-notification-rollout";
import { useMessengerRoomReaderStateStore } from "@/lib/community-messenger/notifications/messenger-room-reader-state-store";
import type { CommunityMessengerMessage } from "@/lib/community-messenger/types";

/**
 * 하단 스크롤·stickToBottom·reader store 위치 힌트.
 * `useMessengerRoomClientPhase1` 의 scrollMessengerToBottom / updateStickToBottomFromScroll / 관련 effect 본문·deps 그대로.
 */
export function useMessengerRoomReaderScrollBottom({
  roomId,
  activeSheet,
  stickToBottomRef,
  messagesViewportRef,
  messageEndRef,
  roomMessages,
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
    | "stickers";
  stickToBottomRef: MutableRefObject<boolean>;
  messagesViewportRef: RefObject<HTMLDivElement | null>;
  messageEndRef: RefObject<HTMLDivElement | null>;
  roomMessages: Array<CommunityMessengerMessage & { pending?: boolean }>;
}): {
  scrollMessengerToBottom: () => void;
  updateStickToBottomFromScroll: () => void;
} {
  const scrollMessengerToBottom = useCallback(() => {
    const id = roomId?.trim();
    if (id && messengerRolloutUsesRoomScrollHints()) {
      useMessengerRoomReaderStateStore.getState().clearPendingNew(id);
      useMessengerRoomReaderStateStore.getState().setScrollPosition(id, "at-bottom");
    }
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const vp = messagesViewportRef.current;
        if (vp) vp.scrollTop = vp.scrollHeight;
        messageEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
      });
    });
  }, [roomId]);

  const updateStickToBottomFromScroll = useCallback(() => {
    const el = messagesViewportRef.current;
    if (!el) return;
    const threshold = 100;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = dist < threshold;
    const id = roomId?.trim();
    if (!id || !messengerRolloutUsesRoomScrollHints()) return;
    let pos: MessengerChatViewPosition;
    if (activeSheet === "search") {
      pos = "jumped-by-search";
    } else if (stickToBottomRef.current) {
      pos = "at-bottom";
    } else {
      pos = "reading-history";
    }
    useMessengerRoomReaderStateStore.getState().setScrollPosition(id, pos);
  }, [roomId, activeSheet]);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [roomId]);

  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollMessengerToBottom();
    }
  }, [roomMessages, scrollMessengerToBottom]);

  return { scrollMessengerToBottom, updateStickToBottomFromScroll };
}
