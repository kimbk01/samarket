"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useCallback, useLayoutEffect, useRef, useState, type ReactNode, type ReactElement } from "react";
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

/**
 * LIST-V1 (10-27 Samsung 실기기): 메신저 허브는 목록 상자(`[data-messenger-hub-list-scroll]`)가 스크롤하고
 * 문서는 움직이지 않는다(허브 본문 스크롤 잠금). 가상 목록이 문서 스크롤을 보면 처음 20행만 그리고 아래는 빈칸이 된다.
 * 실제 스크롤 상자를 찾고, 없으면(다른 화면) 문서 스크롤.
 */
export function resolveChatListScrollElement(anchor: Element | null): Element | null {
  const hub = anchor?.closest("[data-messenger-hub-list-scroll]") ?? null;
  if (hub) return hub;
  return typeof document !== "undefined" ? (document.scrollingElement ?? document.documentElement) : null;
}

/** 스크롤 상자 맨 위에서 목록 시작까지 거리 — 목록 위의 검색·보관·거래 묶음 줄만큼 가상 범위를 민다. */
export function chatListScrollMargin(anchorTop: number, scrollElTop: number, scrollTop: number): number {
  return Math.max(0, Math.round(anchorTop - scrollElTop + scrollTop));
}
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
  /** 문서 스크롤 + flat 렌더 — 거래 탭 페이지네이션 등 */
  forceFlatList?: boolean;
  listFooter?: ReactElement | null;
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
  const useVirtual = !props.forceFlatList && props.items.length >= VIRTUAL_THRESHOLD;
  const rowEstimatePx = props.listVisual === "trade" || props.listVisual === "delivery" ? 88 : ROW_ESTIMATE_PX;
  const listAnchorRef = useRef<HTMLDivElement | null>(null);
  const getScrollElement = useCallback(() => resolveChatListScrollElement(listAnchorRef.current), []);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const anchor = listAnchorRef.current;
    const scrollEl = resolveChatListScrollElement(anchor);
    if (!anchor || !scrollEl) return;
    const scrollElTop = scrollEl === document.scrollingElement ? 0 : scrollEl.getBoundingClientRect().top;
    const next = chatListScrollMargin(anchor.getBoundingClientRect().top, scrollElTop, scrollEl.scrollTop);
    setScrollMargin((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
  });
  const virtualizer = useVirtualizer({
    count: useVirtual ? props.items.length : 0,
    getItemKey: (index) => props.items[index]?.room.id ?? index,
    getScrollElement,
    estimateSize: () => rowEstimatePx,
    overscan: 6,
    scrollMargin,
  });

  const rowProps = {
    viewerUserId: props.viewerUserId,
    favoriteFriendIds: props.favoriteFriendIds,
    /** §15 친구 아님 배지 — 누락 시 행이 친구 목록을 몰라 배지가 안 뜬다 */
    savedFriendIds: props.savedFriendIds,
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
        <FlatListContainer>
          {props.items.map((item) => (
            <CommunityMessengerChatRow key={item.room.id} item={item} {...rowProps} />
          ))}
          {props.listFooter}
        </FlatListContainer>
      </CmReactCommitProbe>
    );
  }

  return (
    <CmReactCommitProbe id="CommunityMessengerChatList">
      <div ref={listAnchorRef} aria-hidden data-cm-chat-list-anchor="" />
      <FlatListContainer className="relative w-full" role="list" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const item = props.items[vi.index]!;
          return (
            <VirtualRowShell
              key={item.room.id}
              virtualIndex={vi.index}
              measureElement={virtualizer.measureElement}
              viStart={vi.start - virtualizer.options.scrollMargin}
            >
              <CommunityMessengerChatRow item={item} {...rowProps} />
            </VirtualRowShell>
          );
        })}
      </FlatListContainer>
      {props.listFooter}
    </CmReactCommitProbe>
  );
}, (prev, next) => {
  if (prev.forceFlatList !== next.forceFlatList) return false;
  if (prev.listFooter !== next.listFooter) return false;
  if (prev.items.length !== next.items.length) return false;
  if (!roomListItemsDisplayEqual(prev.items, next.items)) return false;
  if (
    prev.favoriteFriendIds !== next.favoriteFriendIds &&
    !messengerStringSetsEqual(prev.favoriteFriendIds, next.favoriteFriendIds)
  ) {
    return false;
  }
  if (
    prev.savedFriendIds !== next.savedFriendIds &&
    !messengerStringSetsEqual(prev.savedFriendIds ?? new Set(), next.savedFriendIds ?? new Set())
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
