"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, type ReactNode } from "react";
import { CommunityMessengerChatRow } from "@/components/community-messenger/chat-list/CommunityMessengerChatRow";
import type { MessengerMenuAnchorRect, MessengerChatListVisual } from "@/components/community-messenger/MessengerChatListItem";
import { FlatListContainer } from "@/components/community-messenger/line-ui";
import { CmReactCommitProbe, useCmDevRenderTrace } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import type { MessengerChatListContext } from "@/lib/community-messenger/messenger-ia";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  messengerStringSetsEqual,
  roomListItemsDisplayEqual,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";

const VIRTUAL_THRESHOLD = 16;
const ROW_ESTIMATE_PX = 72;

type Props = {
  items: UnifiedRoomListItem[];
  viewerUserId?: string | null;
  favoriteFriendIds: Set<string>;
  savedFriendIds?: Set<string>;
  busyId: string | null;
  listContext: MessengerChatListContext;
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
  openedSwipeItemId: string | null;
  onOpenSwipeItem: (id: string | null) => void;
  onCloseMenuItem: (id?: string) => void;
  onResetTransientUi: MessengerResetTransientUiFn;
  listVisual?: MessengerChatListVisual;
};

function VirtualRowShell({
  virtualIndex,
  measureElement,
  viStart,
  children,
}: {
  virtualIndex: number;
  measureElement: (el: HTMLElement | null) => void;
  viStart: number;
  children: ReactNode;
}) {
  return (
    <div
      ref={measureElement}
      data-index={virtualIndex}
      className="absolute left-0 top-0 w-full"
      style={{ transform: `translateY(${viStart}px)` }}
    >
      {children}
    </div>
  );
}

export const CommunityMessengerChatList = memo(function CommunityMessengerChatList(props: Props) {
  useCmDevRenderTrace("CommunityMessengerChatList");
  const useVirtual = props.items.length >= VIRTUAL_THRESHOLD;
  const rowEstimatePx = props.listVisual === "trade" || props.listVisual === "delivery" ? 88 : ROW_ESTIMATE_PX;
  const getScrollElement = useCallback(
    () => (typeof document !== "undefined" ? (document.scrollingElement ?? document.documentElement) : null),
    []
  );
  const virtualizer = useVirtualizer({
    count: useVirtual ? props.items.length : 0,
    getItemKey: (index) => props.items[index]?.room.id ?? index,
    getScrollElement,
    estimateSize: () => rowEstimatePx,
    overscan: 6,
  });

  const rowProps = {
    viewerUserId: props.viewerUserId,
    favoriteFriendIds: props.favoriteFriendIds,
    busyId: props.busyId,
    listContext: props.listContext,
    onTogglePin: props.onTogglePin,
    onToggleMute: props.onToggleMute,
    onMarkRead: props.onMarkRead,
    onToggleArchive: props.onToggleArchive,
    onLeaveRoom: props.onLeaveRoom,
    onOpenRoomActions: props.onOpenRoomActions,
    openedSwipeItemId: props.openedSwipeItemId,
    onOpenSwipeItem: props.onOpenSwipeItem,
    onCloseMenuItem: props.onCloseMenuItem,
    onResetTransientUi: props.onResetTransientUi,
    listVisual: props.listVisual,
  };

  if (!useVirtual) {
    return (
      <CmReactCommitProbe id="CommunityMessengerChatList">
        <FlatListContainer className="overflow-y-auto">
          {props.items.map((item) => (
            <CommunityMessengerChatRow key={item.room.id} item={item} {...rowProps} />
          ))}
        </FlatListContainer>
      </CmReactCommitProbe>
    );
  }

  return (
    <CmReactCommitProbe id="CommunityMessengerChatList">
      <FlatListContainer className="relative overflow-y-auto" role="list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const item = props.items[vi.index]!;
          return (
            <VirtualRowShell key={item.room.id} virtualIndex={vi.index} measureElement={virtualizer.measureElement} viStart={vi.start}>
              <CommunityMessengerChatRow item={item} {...rowProps} />
            </VirtualRowShell>
          );
        })}
      </FlatListContainer>
    </CmReactCommitProbe>
  );
}, (prev, next) => {
  if (prev.items.length !== next.items.length) return false;
  if (!roomListItemsDisplayEqual(prev.items, next.items)) return false;
  if (
    prev.favoriteFriendIds !== next.favoriteFriendIds &&
    !messengerStringSetsEqual(prev.favoriteFriendIds, next.favoriteFriendIds)
  ) {
    return false;
  }
  return (
    prev.viewerUserId === next.viewerUserId &&
    prev.busyId === next.busyId &&
    prev.openedSwipeItemId === next.openedSwipeItemId &&
    prev.listContext === next.listContext &&
    prev.listVisual === next.listVisual
  );
});

CommunityMessengerChatList.displayName = "CommunityMessengerChatList";
