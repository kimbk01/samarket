"use client";

import { useCallback, useEffect, useState } from "react";
import type { MessengerChatListVisual, MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import {
  type MessengerChatListChip,
  type MessengerChatListContext,
  messengerChatListChipLabel,
} from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type {
  MessengerPillarSummary,
  UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { CommunityMessengerChatList } from "@/components/community-messenger/chat-list/CommunityMessengerChatList";
import { MessengerPillarSummaryRow } from "@/components/community-messenger/MessengerPillarSummaryRow";
import { TradeChatListEmptyState } from "@/components/community-messenger/trade-chat-list/TradeChatListEmptyState";
import { DeliveryChatListEmptyState } from "@/components/community-messenger/delivery-chat-list/DeliveryChatListEmptyState";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerChatFilterSheet } from "@/components/community-messenger/MessengerChatFilterSheet";
import { TradeChatListLoadMoreFooter } from "@/components/community-messenger/trade-chat-list/TradeChatListLoadMoreFooter";
import { useTradeChatListClientPagination } from "@/lib/community-messenger/trade-chat-list/use-trade-chat-list-client-pagination";

function useMessengerHomeListDocumentScroll(onScroll: () => void) {
  useEffect(() => {
    const root = document.scrollingElement ?? document.documentElement;
    const handler = () => onScroll();
    root.addEventListener("scroll", handler, { passive: true });
    return () => root.removeEventListener("scroll", handler);
  }, [onScroll]);
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
  savedFriendIds?: Set<string>;
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
  /** 인박스로 들어올 때 받은 `?from=...` — 묶음 행 서브 라우트 진입 시 보존 */
  entryOriginQuery?: string | null;
  /** `/community-messenger/trade-chats` · `/delivery-chats` 전용 행 */
  chatListVisual?: MessengerChatListVisual;
};

export function MessengerChatsScreen({
  items,
  viewerUserId = null,
  favoriteFriendIds,
  savedFriendIds,
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
  const isTradeListVisual = chatListVisual === "trade";
  const isDeliveryListVisual = chatListVisual === "delivery";
  const isPillarChatListVisual = isTradeListVisual || isDeliveryListVisual;
  const pillarPagination = useTradeChatListClientPagination({
    items,
    resetKey: String(items.length),
  });
  const renderedListItems = isPillarChatListVisual ? pillarPagination.visibleItems : items;
  const showPillarSummaryRows =
    Boolean(pillarSummaries) && chatListChip === "all" && listContext === "default";
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
      className={`space-y-0 pt-0 ${isPillarChatListVisual ? "bg-[#F8FAF9]" : ""}`}
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
        open={filterSheetOpen && !isPillarChatListVisual}
        value={chatListChip}
        onClose={() => closeAllTransient()}
        onSelect={(next) => {
          closeAllTransient();
          onChatListChipChange(next);
        }}
      />

      {showPillarSummaryRows && pillarSummaries ? (
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
        <CommunityMessengerChatList
          items={renderedListItems}
          viewerUserId={viewerUserId}
          listContext={listContext}
          favoriteFriendIds={favoriteFriendIds}
          savedFriendIds={savedFriendIds}
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
          listVisual={chatListVisual}
          forceFlatList={isPillarChatListVisual}
          listFooter={
            isPillarChatListVisual ? (
              <TradeChatListLoadMoreFooter
                hasMore={pillarPagination.hasMore}
                loadingMore={pillarPagination.loadingMore}
                onLoadMore={pillarPagination.loadMore}
                visibleCount={pillarPagination.visibleCount}
                totalCount={pillarPagination.totalCount}
              />
            ) : null
          }
        />
      ) : showPillarSummaryRows ? null : isTradeListVisual ? (
        <TradeChatListEmptyState filterSummary={null} />
      ) : isDeliveryListVisual ? (
        <DeliveryChatListEmptyState filterSummary={null} />
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
  savedFriendIds,
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
  savedFriendIds?: Set<string>;
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
          <CommunityMessengerChatList
            items={joinedItems}
            viewerUserId={viewerUserId}
            listContext="open_chat"
            favoriteFriendIds={favoriteFriendIds}
          savedFriendIds={savedFriendIds}
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
