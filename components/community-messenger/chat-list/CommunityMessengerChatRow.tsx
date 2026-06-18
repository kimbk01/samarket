"use client";

import { memo } from "react";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";
import type { MessengerMenuAnchorRect, MessengerChatListVisual } from "@/components/community-messenger/MessengerChatListItem";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

export type CommunityMessengerChatRowProps = {
  item: UnifiedRoomListItem;
  viewerUserId?: string | null;
  favoriteFriendIds: Set<string>;
  savedFriendIds?: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onLeaveRoom?: (room: CommunityMessengerRoomSummary) => void;
  onOpenRoomActions?: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  listContext?: MessengerChatListContext;
  openedSwipeItemId?: string | null;
  onOpenSwipeItem?: (id: string | null) => void;
  onCloseMenuItem?: (id?: string) => void;
  onResetTransientUi?: MessengerResetTransientUiFn;
  listVisual?: MessengerChatListVisual;
};

/** Swipe·navigation 계약은 기존 MessengerChatListItem 에 위임한다. */
export const CommunityMessengerChatRow = memo(function CommunityMessengerChatRow(props: CommunityMessengerChatRowProps) {
  return (
    <div
      data-cm-chat-row
      className="min-h-[64px] max-h-[76px] transition-transform duration-100 active:scale-[0.98]"
    >
      <MessengerChatListItem {...props} />
    </div>
  );
});

CommunityMessengerChatRow.displayName = "CommunityMessengerChatRow";
