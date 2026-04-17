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
import { MessengerChatFilterSheet } from "@/components/community-messenger/MessengerChatFilterSheet";
import { enqueueRoomPrefetch } from "@/lib/community-messenger/room-prefetch-queue";

/** `measureElement`로 보정 — 행+`space-y-1.5` 간격을 대략 반영 */
const MESSENGER_CHAT_LIST_VIRTUAL_THRESHOLD = 16;
const MESSENGER_CHAT_LIST_ROW_ESTIMATE_PX = 88;

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
      <div className="space-y-1.5">
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
            listContext={listContext}
            onOpenRoomActions={onOpenRoomActions}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative w-full" role="list" style={{ height: rowVirtualizer.getTotalSize() }}>
      {rowVirtualizer.getVirtualItems().map((vi) => {
        const item = items[vi.index]!;
        return (
          <div
            key={item.room.id}
            role="listitem"
            ref={rowVirtualizer.measureElement}
            data-index={vi.index}
            className="pb-1.5"
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
    </div>
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
      className="space-y-3 pt-1"
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
        <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-3 shadow-[var(--messenger-shadow-soft)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: "var(--messenger-text)" }}>
                {listContext === "archive" ? "보관된 대화" : "대화 목록"}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
                필터는 버튼으로 열고, 안읽음은 뱃지로, 고정은 핀 아이콘으로 확인합니다.
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  closeAllTransient();
                  setFilterSheetOpen(true);
                }}
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 text-[12px] font-semibold active:bg-[color:var(--messenger-primary-soft)]"
                style={{ color: "var(--messenger-text)" }}
              >
                <FilterIcon />
                필터
              </button>
              <span
                className="inline-flex h-10 items-center rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-3 text-[12px] font-semibold"
                style={{ color: "var(--messenger-text)" }}
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
          onOpenRoomActions={onOpenRoomActions}
          openedSwipeItemId={openedSwipeItemId}
          onOpenSwipeItem={onOpenSwipeItem}
          onCloseMenuItem={onCloseMenuItem}
          onResetTransientUi={onResetTransientUi}
        />
      ) : (
        <div
          data-cm-home-empty-state="true"
          className={`px-3 py-8 text-center text-[13px] leading-snug whitespace-pre-line ${
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
  discoverableGroups,
  favoriteFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onPreviewGroup,
  onOpenRoomActions,
  openedSwipeItemId,
  onOpenSwipeItem,
  onCloseMenuItem,
  onResetTransientUi,
  onListScrollStart,
}: {
  joinedItems: UnifiedRoomListItem[];
  viewerUserId?: string | null;
  discoverableGroups: Array<{
    id: string;
    title: string;
    summary: string;
    ownerLabel: string;
    memberCount: number;
    isJoined: boolean;
  }>;
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onPreviewGroup: (groupId: string) => void;
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
      className="space-y-3 pt-1.5"
      onPointerDownCapture={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        if (target.closest("[data-messenger-chat-row='true']")) return;
        if (target.closest("[data-messenger-chat-sheet='true']")) return;
        onResetTransientUi();
      }}
    >
      <div className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-3 shadow-[var(--messenger-shadow-soft)]">
        <p className="text-[14px] font-semibold" style={{ color: "var(--messenger-text)" }}>
          오픈채팅
        </p>
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
          참여 중인 방과 새 오픈채팅을 한 흐름 안에서 탐색할 수 있게 정리했습니다.
        </p>
      </div>

      <div>
        <div className="mb-1 px-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--messenger-text-secondary)" }}>
            참여 중
          </h2>
        </div>
        {joinedItems.length ? (
          <MessengerRoomRows
            useVirtual={useVirtJoined}
            items={joinedItems}
            viewerUserId={viewerUserId}
            listContext="default"
            favoriteFriendIds={favoriteFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onOpenRoomActions={onOpenRoomActions}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
          />
        ) : (
          <div className="px-1 py-4 text-center text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
            참여 중인 오픈채팅이 없습니다.
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 px-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--messenger-text-secondary)" }}>
            찾기
          </h2>
        </div>
        <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
          {discoverableGroups.length ? (
            discoverableGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => {
                  onResetTransientUi();
                  onPreviewGroup(group.id);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left active:bg-[color:var(--messenger-primary-soft)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-medium" style={{ color: "var(--messenger-text)" }}>
                      {group.title}
                    </p>
                    <span className="shrink-0 rounded-full bg-[color:var(--messenger-badge-openchat-bg)] px-1.5 py-0.5 text-[9px] font-semibold text-sky-800">
                      오픈
                    </span>
                    {group.isJoined ? (
                      <span className="shrink-0 rounded-full bg-[color:var(--messenger-primary-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[color:var(--messenger-primary)]">
                        참여
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
                    {group.summary || `${group.ownerLabel} · ${group.memberCount}명`}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-medium text-[color:var(--messenger-primary)]">{group.isJoined ? "입장" : "보기"}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-4 text-center text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
              표시할 오픈채팅이 없습니다.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
