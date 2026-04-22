"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useState } from "react";
import type { MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import {
  type MessengerChatListChip,
  type MessengerChatListContext,
  messengerChatListChipLabel,
} from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";
import { FlatListContainer } from "@/components/community-messenger/line-ui";
import { MessengerChatFilterSheet } from "@/components/community-messenger/MessengerChatFilterSheet";
import { enqueueRoomPrefetch } from "@/lib/community-messenger/room-prefetch-queue";

/** `measureElement`로 보정 — 행+`space-y-1.5` 간격을 대략 반영 */
const MESSENGER_CHAT_LIST_VIRTUAL_THRESHOLD = 16;
const MESSENGER_CHAT_LIST_ROW_ESTIMATE_PX = 72;

function useMessengerHomeListDocumentScroll(onScroll: () => void) {
  useEffect(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const handler = () => onScroll();
    root.addEventListener("scroll", handler, { passive: true });
    return () => root.removeEventListener("scroll", handler);
  }, [onScroll]);
}

type MessengerRoomRowsProps = {
  useVirtual: boolean;
  items: UnifiedRoomListItem[];
  viewerUserId?: string | null;
  listContext: MessengerChatListContext;
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onLeaveRoom: (room: CommunityMessengerRoomSummary) => void;
  onOpenRoomActions?: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  openedSwipeItemId: string | null;
  onOpenSwipeItem: (id: string | null) => void;
  onCloseMenuItem: (id?: string) => void;
  onResetTransientUi: MessengerResetTransientUiFn;
};

function MessengerRoomRows({
  useVirtual,
  items,
  viewerUserId = null,
  listContext,
  favoriteFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onLeaveRoom,
  onOpenRoomActions,
  openedSwipeItemId,
  onOpenSwipeItem,
  onCloseMenuItem,
  onResetTransientUi,
}: MessengerRoomRowsProps) {
  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? items.length : 0,
    getItemKey: (index) => items[index]?.room.id ?? index,
    getScrollElement: () =>
      typeof document !== "undefined" ? (document.scrollingElement ?? document.documentElement) : null,
    estimateSize: () => MESSENGER_CHAT_LIST_ROW_ESTIMATE_PX,
    overscan: 6,
  });

  if (!useVirtual) {
    return (
      <FlatListContainer>
        {items.map((item) => (
          <MessengerChatListItem
            key={item.room.id}
            item={item}
            viewerUserId={viewerUserId}
            favoriteFriendIds={favoriteFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onLeaveRoom={onLeaveRoom}
            listContext={listContext}
            onOpenRoomActions={onOpenRoomActions}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
          />
        ))}
      </FlatListContainer>
    );
  }

  return (
    <FlatListContainer className="relative" role="list" style={{ height: rowVirtualizer.getTotalSize() }}>
      {rowVirtualizer.getVirtualItems().map((vi) => {
        const item = items[vi.index]!;
        return (
          <div
            key={item.room.id}
            role="listitem"
            ref={rowVirtualizer.measureElement}
            data-index={vi.index}
            className="pb-0"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${vi.start}px)`,
            }}
          >
            <MessengerChatListItem
              item={item}
              viewerUserId={viewerUserId}
              favoriteFriendIds={favoriteFriendIds}
              busyId={busyId}
              onTogglePin={onTogglePin}
              onToggleMute={onToggleMute}
              onMarkRead={onMarkRead}
              onToggleArchive={onToggleArchive}
              onLeaveRoom={onLeaveRoom}
              listContext={listContext}
              onOpenRoomActions={onOpenRoomActions}
              openedSwipeItemId={openedSwipeItemId}
              onOpenSwipeItem={onOpenSwipeItem}
              onCloseMenuItem={onCloseMenuItem}
              onResetTransientUi={onResetTransientUi}
            />
          </div>
        );
      })}
    </FlatListContainer>
  );
}

function FilterIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

type Props = {
  items: UnifiedRoomListItem[];
  viewerUserId?: string | null;
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onLeaveRoom: (room: CommunityMessengerRoomSummary) => void;
  onOpenRoomActions?: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  chatListChip: MessengerChatListChip;
  onChatListChipChange: (next: MessengerChatListChip) => void;
  emptyMessage: string;
  showFilters?: boolean;
  listContext?: MessengerChatListContext;
  openedSwipeItemId: string | null;
  onOpenSwipeItem: (id: string | null) => void;
  onCloseMenuItem: (id?: string) => void;
  onResetTransientUi: MessengerResetTransientUiFn;
  onListScrollStart: () => void;
};

export function MessengerChatsScreen({
  items,
  viewerUserId = null,
  favoriteFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onLeaveRoom,
  onOpenRoomActions,
  chatListChip,
  onChatListChipChange,
  emptyMessage,
  showFilters = true,
  listContext = "default",
  openedSwipeItemId,
  onOpenSwipeItem,
  onCloseMenuItem,
  onResetTransientUi,
  onListScrollStart,
}: Props) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const useVirt = items.length >= MESSENGER_CHAT_LIST_VIRTUAL_THRESHOLD;
  const onDocumentScroll = useCallback(() => {
    setFilterSheetOpen(false);
    onListScrollStart();
  }, [onListScrollStart]);
  useMessengerHomeListDocumentScroll(onDocumentScroll);

  useEffect(() => {
    // 화면에 보이는 리스트를 기준으로 idle 프리패치(첫 진입 체감 개선).
    // 별도 IntersectionObserver 없이도 상단 N개만으로 효과가 크다.
    for (const item of items.slice(0, 16)) {
      enqueueRoomPrefetch(item.room.id);
    }
  }, [items]);

  const closeAllTransient = () => {
    setFilterSheetOpen(false);
    onResetTransientUi();
  };

  return (
    <section
      className="space-y-2 pt-0"
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest("[data-messenger-chat-row='true']")) return;
        if (target.closest("[data-messenger-chat-sheet='true']")) return;
        if (target.closest("[data-messenger-chat-filter-sheet='true']")) return;
        closeAllTransient();
      }}
    >
      {showFilters ? (
        <div className="border-b border-[color:var(--messenger-divider)] px-1 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="sam-text-body font-bold leading-tight" style={{ color: "var(--messenger-text)" }}>
                {listContext === "archive" ? "보관된 대화" : "대화 목록"}
              </p>
              <p className="mt-0.5 sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
                필터 · 안읽음 · 고정은 목록에서 확인합니다.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  closeAllTransient();
                  setFilterSheetOpen(true);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-2.5 sam-text-helper font-semibold active:opacity-80"
                style={{ color: "var(--messenger-text)" }}
              >
                <FilterIcon />
                필터
              </button>
              <span
                className="inline-flex h-9 max-w-[7rem] items-center truncate rounded-full bg-[color:var(--messenger-surface-muted)] px-2.5 sam-text-xxs font-semibold"
                style={{ color: "var(--messenger-text-secondary)" }}
              >
                {messengerChatListChipLabel(chatListChip)}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      <MessengerChatFilterSheet
        open={filterSheetOpen}
        value={chatListChip}
        onClose={() => closeAllTransient()}
        onSelect={(next) => {
          closeAllTransient();
          onChatListChipChange(next);
        }}
      />

      {items.length ? (
        <MessengerRoomRows
          useVirtual={useVirt}
          items={items}
          viewerUserId={viewerUserId}
          listContext={listContext}
          favoriteFriendIds={favoriteFriendIds}
          busyId={busyId}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
          onMarkRead={onMarkRead}
          onToggleArchive={onToggleArchive}
          onLeaveRoom={onLeaveRoom}
          onOpenRoomActions={onOpenRoomActions}
          openedSwipeItemId={openedSwipeItemId}
          onOpenSwipeItem={onOpenSwipeItem}
          onCloseMenuItem={onCloseMenuItem}
          onResetTransientUi={onResetTransientUi}
        />
      ) : (
        <div
          data-cm-home-empty-state="true"
          className={`px-3 py-8 text-center sam-text-body-secondary leading-snug whitespace-pre-line ${
            listContext === "archive"
              ? "rounded-[var(--messenger-radius-md)] border border-dashed border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] text-[color:var(--messenger-text-secondary)]"
              : "text-[color:var(--messenger-text-secondary)]"
          }`}
        >
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

export function MessengerOpenChatScreen({
  joinedItems,
  viewerUserId = null,
  favoriteFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onLeaveRoom,
  onOpenMeetingFind,
  onOpenRoomActions,
  openedSwipeItemId,
  onOpenSwipeItem,
  onCloseMenuItem,
  onResetTransientUi,
  onListScrollStart,
}: {
  joinedItems: UnifiedRoomListItem[];
  viewerUserId?: string | null;
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onLeaveRoom: (room: CommunityMessengerRoomSummary) => void;
  onOpenMeetingFind: () => void;
  onOpenRoomActions?: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  openedSwipeItemId: string | null;
  onOpenSwipeItem: (id: string | null) => void;
  onCloseMenuItem: (id?: string) => void;
  onResetTransientUi: MessengerResetTransientUiFn;
  onListScrollStart: () => void;
}) {
  const useVirtJoined = joinedItems.length >= MESSENGER_CHAT_LIST_VIRTUAL_THRESHOLD;
  useMessengerHomeListDocumentScroll(onListScrollStart);

  return (
    <section
      className="space-y-2 pt-0"
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest("[data-messenger-chat-row='true']")) return;
        if (target.closest("[data-messenger-chat-sheet='true']")) return;
        onResetTransientUi();
      }}
    >
      <div className="border-b border-[color:var(--messenger-divider)] px-1 py-2">
        <p className="sam-text-body font-bold leading-tight" style={{ color: "var(--messenger-text)" }}>
          모임
        </p>
        <p className="mt-0.5 sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
          참여 중인 모임 채팅과 새 모임을 한곳에서 확인합니다.
        </p>
      </div>

      <div>
        <div className="mb-0.5 px-0.5 pt-1">
          <h2 className="sam-text-body-secondary font-bold" style={{ color: "var(--messenger-text)" }}>
            참여 중
          </h2>
        </div>
        {joinedItems.length ? (
          <MessengerRoomRows
            useVirtual={useVirtJoined}
            items={joinedItems}
            viewerUserId={viewerUserId}
            listContext="open_chat"
            favoriteFriendIds={favoriteFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onLeaveRoom={onLeaveRoom}
            onOpenRoomActions={onOpenRoomActions}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
          />
        ) : (
          <div className="px-1 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
            참여 중인 모임이 없습니다.
          </div>
        )}
      </div>

      <div className="px-0.5 pt-3">
        <button
          type="button"
          onClick={() => {
            onResetTransientUi();
            onOpenMeetingFind();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3.5 sam-text-body-secondary font-semibold text-[color:var(--messenger-text)] shadow-[var(--messenger-shadow-soft)] active:bg-[color:var(--messenger-surface-muted)]"
        >
          모임 찾기
        </button>
      </div>
    </section>
  );
}
