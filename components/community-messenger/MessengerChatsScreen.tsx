"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { messengerRoomPrefetchPriorityScore } from "@/lib/community-messenger/room-prefetch-queue";
import { useMessengerRoomListPrefetchRefCallback } from "@/lib/community-messenger/use-messenger-room-list-prefetch-intersection";
import type { MessengerChatListVisual, MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import {
  type MessengerChatListChip,
  type MessengerChatListContext,
  messengerChatListChipLabel,
} from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import {
  messengerStringSetsEqual,
  roomListItemsDisplayEqual,
  type MessengerPillarSummary,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import { logCmMemoPropDiff, logCmMemoPropEqual } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";
import { FlatListContainer } from "@/components/community-messenger/line-ui";
import { MessengerChatFilterSheet } from "@/components/community-messenger/MessengerChatFilterSheet";
import { MessengerPillarSummaryRow } from "@/components/community-messenger/MessengerPillarSummaryRow";
import { CmReactCommitProbe, useCmDevRenderTrace } from "@/lib/community-messenger/dev/cm-event-loop-dev";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

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
  chatListVisual?: MessengerChatListVisual;
};

function MessengerVirtualRoomRowShell({
  roomId,
  lastMessageAt,
  measureElement,
  viIndex,
  viStart,
  children,
}: {
  roomId: string;
  lastMessageAt: string;
  measureElement: (el: HTMLElement | null) => void;
  viIndex: number;
  viStart: number;
  children: ReactNode;
}) {
  const prefetchAttach = useMessengerRoomListPrefetchRefCallback(
    roomId,
    true,
    messengerRoomPrefetchPriorityScore(lastMessageAt)
  );
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      measureElement(node);
      prefetchAttach(node);
    },
    [measureElement, prefetchAttach]
  );

  return (
    <div
      role="listitem"
      ref={setRef}
      data-index={viIndex}
      className="pb-0"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${viStart}px)`,
      }}
    >
      {children}
    </div>
  );
}

function messengerRoomRowsPropsEqual(prev: MessengerRoomRowsProps, next: MessengerRoomRowsProps): boolean {
  const reasons: string[] = [];
  if (!roomListItemsDisplayEqual(prev.items, next.items)) {
    if (prev.items.length !== next.items.length) reasons.push("items.length");
    else reasons.push("items.display");
  }
  if (prev.useVirtual !== next.useVirtual) reasons.push("useVirtual");
  if (prev.viewerUserId !== next.viewerUserId) reasons.push("viewerUserId");
  if (
    prev.favoriteFriendIds !== next.favoriteFriendIds &&
    !messengerStringSetsEqual(prev.favoriteFriendIds, next.favoriteFriendIds)
  ) {
    reasons.push("favoriteFriendIds");
  }
  if (prev.busyId !== next.busyId) reasons.push("busyId");
  if (prev.openedSwipeItemId !== next.openedSwipeItemId) reasons.push("openedSwipeItemId");
  if (prev.listContext !== next.listContext) reasons.push("listContext");
  if (prev.chatListVisual !== next.chatListVisual) reasons.push("chatListVisual");
  if (prev.onTogglePin !== next.onTogglePin) reasons.push("onTogglePin");
  if (prev.onToggleMute !== next.onToggleMute) reasons.push("onToggleMute");
  if (prev.onMarkRead !== next.onMarkRead) reasons.push("onMarkRead");
  if (prev.onToggleArchive !== next.onToggleArchive) reasons.push("onToggleArchive");
  if (prev.onLeaveRoom !== next.onLeaveRoom) reasons.push("onLeaveRoom");
  if (prev.onOpenRoomActions !== next.onOpenRoomActions) reasons.push("onOpenRoomActions");
  if (prev.onOpenSwipeItem !== next.onOpenSwipeItem) reasons.push("onOpenSwipeItem");
  if (prev.onCloseMenuItem !== next.onCloseMenuItem) reasons.push("onCloseMenuItem");
  if (prev.onResetTransientUi !== next.onResetTransientUi) reasons.push("onResetTransientUi");

  if (reasons.length > 0) {
    logCmMemoPropDiff("RoomList", `rows:${next.items.length}`, reasons);
    return false;
  }
  logCmMemoPropEqual("RoomList", `rows:${next.items.length}`);
  return true;
}

const MessengerRoomRows = memo(function MessengerRoomRows({
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
  chatListVisual = "default",
}: MessengerRoomRowsProps) {
  useCmDevRenderTrace("RoomList");
  const rowEstimatePx =
    chatListVisual === "trade" || chatListVisual === "delivery" ? 88 : MESSENGER_CHAT_LIST_ROW_ESTIMATE_PX;
  const getVirtualScrollElement = useCallback(
    () => (typeof document !== "undefined" ? (document.scrollingElement ?? document.documentElement) : null),
    []
  );
  const estimateVirtualRowSize = useCallback(() => rowEstimatePx, [rowEstimatePx]);
  const getVirtualItemKey = useCallback(
    (index: number) => items[index]?.room.id ?? index,
    [items]
  );
  const rowVirtualizer = useVirtualizer({
    count: useVirtual ? items.length : 0,
    getItemKey: getVirtualItemKey,
    getScrollElement: getVirtualScrollElement,
    estimateSize: estimateVirtualRowSize,
    overscan: 6,
  });

  if (!useVirtual) {
    return (
      <CmReactCommitProbe id="RoomList">
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
            listVisual={chatListVisual}
          />
        ))}
      </FlatListContainer>
      </CmReactCommitProbe>
    );
  }

  return (
    <CmReactCommitProbe id="RoomList">
    <FlatListContainer className="relative" role="list" style={{ height: rowVirtualizer.getTotalSize() }}>
      {rowVirtualizer.getVirtualItems().map((vi) => {
        const item = items[vi.index]!;
        return (
          <MessengerVirtualRoomRowShell
            key={item.room.id}
            roomId={item.room.id}
            lastMessageAt={item.room.lastMessageAt}
            measureElement={rowVirtualizer.measureElement}
            viIndex={vi.index}
            viStart={vi.start}
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
              listVisual={chatListVisual}
            />
          </MessengerVirtualRoomRowShell>
        );
      })}
    </FlatListContainer>
    </CmReactCommitProbe>
  );
}, messengerRoomRowsPropsEqual);

MessengerRoomRows.displayName = "RoomList";

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
  /**
   * 인박스 상단 묶음 행(거래·배달). 거래/배달 서브 라우트(`pillar` 모드)나
   * `chatListChip !== "all"` 일 때는 숨긴다.
   */
  pillarSummaries?: {
    trade: MessengerPillarSummary;
    delivery: MessengerPillarSummary;
  } | null;
  /**
   * 인박스로 들어올 때 받은 `?from=...`. 묶음 행을 통해 서브 라우트로 갈 때
   * 출처를 보존하기 위해 전달한다.
   */
  entryOriginQuery?: string | null;
  /** `/community-messenger/trade-chats` · `/delivery-chats` 전용 행 */
  chatListVisual?: MessengerChatListVisual;
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
  pillarSummaries = null,
  entryOriginQuery = null,
  chatListVisual = "default",
}: Props) {
  const { t, safeT } = useI18n();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const useVirt = items.length >= MESSENGER_CHAT_LIST_VIRTUAL_THRESHOLD;
  const onDocumentScroll = useCallback(() => {
    setFilterSheetOpen((prev) => (prev ? false : prev));
    onListScrollStart();
  }, [onListScrollStart]);
  useMessengerHomeListDocumentScroll(onDocumentScroll);

  const closeAllTransient = () => {
    setFilterSheetOpen((prev) => (prev ? false : prev));
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
            <p className="min-w-0 sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
              {t("cm_ui_chat_list_filter_hint")}
            </p>
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
                <span className="truncate">{safeT("cm_ui_filter_button_short")}</span>
              </button>
              <span
                className="inline-flex h-9 max-w-[min(7rem,32vw)] min-w-0 items-center truncate rounded-full bg-[color:var(--messenger-surface-muted)] px-2.5 text-[12px] font-semibold leading-[1.2]"
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

      {pillarSummaries && chatListChip === "all" && listContext === "default" ? (
        <div className="space-y-px border-b border-[color:var(--messenger-divider)] pb-1">
          <MessengerPillarSummaryRow
            variant="trade"
            summary={pillarSummaries.trade}
            entryOriginQuery={entryOriginQuery}
          />
          <MessengerPillarSummaryRow
            variant="delivery"
            summary={pillarSummaries.delivery}
            entryOriginQuery={entryOriginQuery}
          />
        </div>
      ) : null}

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
          chatListVisual={chatListVisual}
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
  onCreateGroup,
  onCreateOpenGroup,
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
  onCreateGroup: () => void;
  onCreateOpenGroup: () => void;
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
  const { safeT } = useI18n();
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
          {safeT("cm_ia_section_open_chat")}
        </p>
        <p className="mt-0.5 sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
          {safeT("cm_ui_open_chat_hub_desc")}
        </p>
        <p className="mt-1 sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
          {safeT("cm_ui_group_rooms_manage_hint")}
        </p>
      </div>

      <div className="grid gap-2 px-0.5">
        <button
          type="button"
          onClick={() => {
            onResetTransientUi();
            onCreateGroup();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--messenger-radius-md)] border border-sam-primary-border bg-sam-primary-soft px-4 py-3 sam-text-body-secondary font-semibold text-sam-primary active:opacity-90"
        >
          {safeT("cm_ui_create_group_chat")}
        </button>
        <button
          type="button"
          onClick={() => {
            onResetTransientUi();
            onCreateOpenGroup();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3 sam-text-body-secondary font-semibold text-[color:var(--messenger-text)] active:bg-[color:var(--messenger-surface-muted)]"
        >
          {safeT("cm_ui_create_open_group_room")}
        </button>
      </div>

      <div>
        <div className="mb-0.5 px-0.5 pt-1">
          <h2 className="sam-text-body-secondary font-bold" style={{ color: "var(--messenger-text)" }}>
            {safeT("cm_ui_open_chat_joined_heading")}
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
            {safeT("cm_ui_open_chat_empty_joined")}
          </div>
        )}
      </div>
    </section>
  );
}
