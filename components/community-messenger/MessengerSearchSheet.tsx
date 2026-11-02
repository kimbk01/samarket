"use client";

import { useCallback, useState, type ReactNode } from "react";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useMessengerLongPress } from "@/lib/community-messenger/use-messenger-long-press";
import type {
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import {
  formatConversationTimestamp,
  getRoomTypeBadgeLabel,
  type UnifiedRoomListItem,
} from "@/lib/community-messenger/use-community-messenger-home-state";

function EmptyHint({ children }: { children: string }) {
  return (
    <p
      className="rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-secondary)] py-2 px-2 text-[length:var(--overlay-caption-size)] leading-snug"
      style={{ color: "var(--overlay-text-secondary)" }}
    >
      {children}
    </p>
  );
}

function MessengerSearchSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h3
        className="text-[length:var(--overlay-caption-size)] font-semibold uppercase tracking-wide"
        style={{ color: "var(--overlay-text-secondary)" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export type SearchSheetAction =
  | { kind: "friend"; friend: CommunityMessengerProfileLite }
  | { kind: "room"; item: UnifiedRoomListItem }
  | { kind: "message"; item: UnifiedRoomListItem }
  | { kind: "open"; group: CommunityMessengerDiscoverableGroupSummary }
  | { kind: "recent"; term: string };

type Props = {
  keyword: string;
  viewerUserId?: string | null;
  onKeywordChange: (next: string) => void;
  onClose: () => void;
  onCommitRecentSearch: (value: string) => void;
  onRemoveRecentSearch: (value: string) => void;
  recentSearches: string[];
  queryActive: boolean;
  searchFriendMatches: CommunityMessengerProfileLite[];
  searchRoomMatches: UnifiedRoomListItem[];
  searchMessageMatches: UnifiedRoomListItem[];
  searchOpenChatMatches: CommunityMessengerDiscoverableGroupSummary[];
  favoriteFriendIds: Set<string>;
  savedFriendIds?: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onSelectFriend: (friend: CommunityMessengerProfileLite) => void;
  onSelectOpenGroup: (groupId: string) => void;
  onSelectMessageRoom: (roomId: string) => void;
};

function SearchActionsSheet({
  action,
  keyword,
  onDismiss,
  onCommitRecentSearch,
  onRemoveRecentSearch,
  onClose,
  onKeywordChange,
  onSelectFriend,
  onSelectOpenGroup,
  onSelectMessageRoom,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
}: {
  action: SearchSheetAction;
  keyword: string;
  onDismiss: () => void;
  onCommitRecentSearch: (value: string) => void;
  onRemoveRecentSearch: (value: string) => void;
  onClose: () => void;
  onKeywordChange: (next: string) => void;
  onSelectFriend: (friend: CommunityMessengerProfileLite) => void;
  onSelectOpenGroup: (groupId: string) => void;
  onSelectMessageRoom: (roomId: string) => void;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
}) {
  const { t } = useI18n();
  /** 목록형 메뉴 행 — 팝업 SSOT 행 (48 · 16/500 · 눌림 배경만) */
  const row = "dibay-overlay-popover__item";

  return (
    <MessengerHomeBottomSheetShell
      onClose={onDismiss}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_chat_actions")}
      panelClassName="border-[color:var(--overlay-border)] shadow-[var(--messenger-shadow-soft)] pb-[max(0.75rem,var(--safe-bottom))]"
    >
        {action.kind === "recent" ? (
          <nav className="flex flex-col p-1" aria-label={t("cm_ui_recent_search_actions")}>
            <button
              type="button"
              className={row}
              onClick={() => {
                onKeywordChange(action.term);
                onDismiss();
              }}
            >
              {t("cm_ui_put_in_search_box")}
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                onRemoveRecentSearch(action.term);
                onDismiss();
              }}
            >
              {t("cm_ui_remove_from_recent_searches")}
            </button>
          </nav>
        ) : null}
        {action.kind === "friend" ? (
          <nav className="flex flex-col p-1" aria-label={t("cm_ui_friend_search_results")}>
            <button
              type="button"
              className={row}
              onClick={() => {
                onCommitRecentSearch(keyword);
                onClose();
                onSelectFriend(action.friend);
                onDismiss();
              }}
            >
              {t("cm_ui_open_profile")}
            </button>
          </nav>
        ) : null}
        {action.kind === "room" || action.kind === "message" ? (
          <nav className="flex flex-col p-1" aria-label={t("cm_ui_chat_actions")}>
            <button
              type="button"
              className={row}
              onClick={() => {
                const item = action.item;
                onCommitRecentSearch(keyword);
                onClose();
                onSelectMessageRoom(item.room.id);
                onDismiss();
              }}
            >
              {t("cm_ui_open_conversation")}
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                void onTogglePin(action.item.room);
                onDismiss();
              }}
            >
              {action.item.room.isPinned ? t("cm_ui_unpin") : t("cm_ui_pin_conversation")}
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                void onToggleArchive(action.item.room);
                onDismiss();
              }}
            >
              {action.item.room.isArchivedByViewer ? t("cm_ui_unarchive") : t("cm_ui_move_to_archive")}
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                void onMarkRead(action.item.room);
                onDismiss();
              }}
            >
              {t("cm_ui_mark_as_read")}
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                void onToggleMute(action.item.room);
                onDismiss();
              }}
            >
              {action.item.room.isMuted ? t("cm_ui_turn_on_notifications") : t("cm_ui_turn_off_notifications")}
            </button>
          </nav>
        ) : null}
        {action.kind === "open" ? (
          <nav className="flex flex-col p-1" aria-label={t("nav_messenger_open_group")}>
            <button
              type="button"
              className={row}
              onClick={() => {
                onCommitRecentSearch(keyword);
                onClose();
                onSelectOpenGroup(action.group.id);
                onDismiss();
              }}
            >
              {t("cm_ui_open")}
            </button>
          </nav>
        ) : null}
        <button
          type="button"
          className="dibay-overlay-btn dibay-overlay-btn--text !flex-none mt-1"
          onClick={onDismiss}
        >
          {t("common_cancel")}
        </button>
    </MessengerHomeBottomSheetShell>
  );
}

function RecentChip({
  term,
  onApply,
  onOpenMenu,
}: {
  term: string;
  onApply: () => void;
  onOpenMenu: () => void;
}) {
  const { bind, consumeClickSuppression } = useMessengerLongPress(onOpenMenu, { thresholdMs: 480 });
  return (
    <button
      type="button"
      {...bind}
      onClick={() => {
        if (consumeClickSuppression()) return;
        onApply();
      }}
      className="dibay-overlay-chip"
    >
      {term}
    </button>
  );
}

function FriendSearchRow({
  friend,
  keyword,
  onCommitRecentSearch,
  onClose,
  onSelectFriend,
  onOpenMenu,
}: {
  friend: CommunityMessengerProfileLite;
  keyword: string;
  onCommitRecentSearch: (v: string) => void;
  onClose: () => void;
  onSelectFriend: (f: CommunityMessengerProfileLite) => void;
  onOpenMenu: () => void;
}) {
  const { t } = useI18n();
  const { bind, consumeClickSuppression } = useMessengerLongPress(onOpenMenu, { thresholdMs: 480 });
  return (
    <button
      type="button"
      {...bind}
      onClick={() => {
        if (consumeClickSuppression()) return;
        onCommitRecentSearch(keyword);
        onClose();
        onSelectFriend(friend);
      }}
      className="flex min-h-[var(--overlay-btn-height)] w-full items-center justify-between gap-2 border-b border-[color:var(--overlay-border)] px-2.5 py-2 text-left transition-colors last:border-b-0 active:bg-[color:var(--overlay-secondary)]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-text-primary)]">{friend.label}</p>
          <span className="rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--sm-color-primary-soft)] px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-medium text-[color:var(--overlay-primary)]">
            {t("nav_messenger_friend")}
          </span>
          {friend.isFavoriteFriend ? (
            <span className="rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-secondary)] px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-medium text-[color:var(--overlay-text-secondary)]">
              ★
            </span>
          ) : null}
          {friend.isHiddenFriend ? (
            <span className="rounded-[length:var(--overlay-radius-sm)] bg-[color:var(--overlay-secondary)] px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-medium text-[color:var(--overlay-text-secondary)]">
              {t("common_hide")}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">{friend.subtitle ?? ""}</p>
      </div>
      <span className="text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">{t("cm_ui_open")}</span>
    </button>
  );
}

function OpenGroupSearchRow({
  group,
  keyword,
  onCommitRecentSearch,
  onClose,
  onSelectOpenGroup,
  onOpenMenu,
}: {
  group: CommunityMessengerDiscoverableGroupSummary;
  keyword: string;
  onCommitRecentSearch: (v: string) => void;
  onClose: () => void;
  onSelectOpenGroup: (id: string) => void;
  onOpenMenu: () => void;
}) {
  const { t } = useI18n();
  const { bind, consumeClickSuppression } = useMessengerLongPress(onOpenMenu, { thresholdMs: 480 });
  return (
    <button
      type="button"
      {...bind}
      onClick={() => {
        if (consumeClickSuppression()) return;
        onCommitRecentSearch(keyword);
        onClose();
        onSelectOpenGroup(group.id);
      }}
      className="flex min-h-[var(--overlay-btn-height)] w-full items-center justify-between gap-2 border-b border-[color:var(--overlay-border)] px-2.5 py-2 text-left transition-colors last:border-b-0 active:bg-[color:var(--overlay-secondary)]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-text-primary)]">{group.title}</p>
          <span className="rounded-full bg-[color:var(--overlay-secondary)] px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-semibold text-[color:var(--overlay-text-secondary)]">
            {t("nav_messenger_open_group")}
          </span>
          {group.isJoined ? (
            <span className="rounded-full bg-[color:var(--sm-color-primary-soft)] px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-medium text-[color:var(--overlay-primary)]">
              {t("cm_ui_joined")}
            </span>
          ) : null}
        </div>
        <p className="truncate text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">
          {group.summary || `${group.regionText || group.ownerLabel} · ${group.categoryText || t("nav_messenger_open_group")} · ${t("nav_chat_count_people", { count: group.memberCount })}`}
        </p>
      </div>
      <span className="text-[length:var(--overlay-caption-size)] font-medium text-[color:var(--overlay-primary)]">
        {group.isJoined ? t("cm_ui_enter") : group.meetingId ? t("cm_ui_view_meeting") : t("cm_ui_view")}
      </span>
    </button>
  );
}

function MessageHitRow({
  item,
  keyword,
  onCommitRecentSearch,
  onClose,
  onSelectMessageRoom,
  onOpenMenu,
}: {
  item: UnifiedRoomListItem;
  keyword: string;
  onCommitRecentSearch: (v: string) => void;
  onClose: () => void;
  onSelectMessageRoom: (roomId: string) => void;
  onOpenMenu: () => void;
}) {
  const { bind, consumeClickSuppression } = useMessengerLongPress(onOpenMenu, { thresholdMs: 480 });
  return (
    <button
      type="button"
      {...bind}
      onClick={() => {
        if (consumeClickSuppression()) return;
        onCommitRecentSearch(keyword);
        onClose();
        onSelectMessageRoom(item.room.id);
      }}
      className="flex min-h-[var(--overlay-btn-height)] w-full items-center justify-between gap-2 border-b border-[color:var(--overlay-border)] px-2.5 py-2 text-left transition-colors last:border-b-0 active:bg-[color:var(--overlay-secondary)]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[length:var(--overlay-body-2-size)] font-medium text-[color:var(--overlay-text-primary)]">{item.room.title}</p>
          <span className="rounded-full bg-[color:var(--sm-color-primary-soft)] px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-medium text-[color:var(--overlay-primary)]">
            {getRoomTypeBadgeLabel(item.room)}
          </span>
        </div>
        <p className="truncate text-[length:var(--overlay-caption-size)] text-[color:var(--overlay-text-secondary)]">{item.preview}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[length:var(--overlay-caption-size)] tabular-nums text-[color:var(--overlay-text-secondary)]">{formatConversationTimestamp(item.lastEventAt)}</p>
      </div>
    </button>
  );
}

export function MessengerSearchSheet({
  keyword,
  viewerUserId = null,
  onKeywordChange,
  onClose,
  onCommitRecentSearch,
  onRemoveRecentSearch,
  recentSearches,
  queryActive,
  searchFriendMatches,
  searchRoomMatches,
  searchMessageMatches,
  searchOpenChatMatches,
  favoriteFriendIds,
  savedFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onSelectFriend,
  onSelectOpenGroup,
  onSelectMessageRoom,
}: Props) {
  const { t } = useI18n();
  const [action, setAction] = useState<SearchSheetAction | null>(null);

  const openRoomMenu = useCallback((item: UnifiedRoomListItem) => {
    setAction({ kind: "room", item });
  }, []);

  const dismissAction = useCallback(() => setAction((prev) => (prev === null ? prev : null)), []);

  return (
    <>
      <MessengerHomeBottomSheetShell
        onClose={onClose}
        closeAriaLabel={t("nav_close")}
        dialogAriaLabel={t("common_search")}
        panelClassName="border-[color:var(--overlay-border)] shadow-[var(--messenger-shadow-soft)]"
      >
        <div
          data-messenger-shell
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(0.75rem,var(--kb-safe-bottom))] pt-2"
        >
          <p
            className="text-center text-[length:var(--overlay-title-2-size)] font-semibold leading-[1.4]"
            style={{ color: "var(--overlay-text-primary)" }}
          >
            {t("common_search")}
          </p>
          <input
            value={keyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onCommitRecentSearch(keyword);
              }
            }}
            placeholder={t("cm_ui_friend_room_message_meeting")}
            className="dibay-overlay-input !mt-2 placeholder:text-[color:var(--overlay-text-secondary)]"
          />
          <div className="mt-2 space-y-2.5">
            {!queryActive ? (
              <MessengerSearchSection title={t("cm_ui_recent_searches")}>
                {recentSearches.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map((k) => (
                      <RecentChip
                        key={k}
                        term={k}
                        onApply={() => onKeywordChange(k)}
                        onOpenMenu={() => setAction({ kind: "recent", term: k })}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyHint>{t("cm_ui_no_recent_searches")}</EmptyHint>
                )}
              </MessengerSearchSection>
            ) : (
              <>
                <MessengerSearchSection title={t("nav_messenger_friends")}>
                  {searchFriendMatches.length ? (
                    <div className="overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)]">
                      {searchFriendMatches.map((friend) => (
                        <FriendSearchRow
                          key={`friend-search-${friend.id}`}
                          friend={friend}
                          keyword={keyword}
                          onCommitRecentSearch={onCommitRecentSearch}
                          onClose={onClose}
                          onSelectFriend={onSelectFriend}
                          onOpenMenu={() => setAction({ kind: "friend", friend })}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyHint>{t("cm_ui_no_matching_friends")}</EmptyHint>
                  )}
                </MessengerSearchSection>
                <MessengerSearchSection title={t("cm_ui_chat_room")}>
                  {searchRoomMatches.length ? (
                    <div
                      className="space-y-1.5 rounded-[length:var(--overlay-radius-md)] p-0.5"
                      style={{ backgroundColor: "var(--overlay-secondary)" }}
                    >
                      {searchRoomMatches.map((item) => (
                        <MessengerChatListItem
                          key={`search-room-${item.room.id}`}
                          item={item}
                          viewerUserId={viewerUserId}
                          favoriteFriendIds={favoriteFriendIds}
                          savedFriendIds={savedFriendIds}
                          busyId={busyId}
                          onTogglePin={onTogglePin}
                          onToggleMute={onToggleMute}
                          onMarkRead={onMarkRead}
                          onToggleArchive={onToggleArchive}
                          compact
                          onCompactLongPress={() => openRoomMenu(item)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyHint>{t("cm_ui_no_matching_chat_rooms")}</EmptyHint>
                  )}
                </MessengerSearchSection>
                <MessengerSearchSection title={t("nav_messenger_open_group")}>
                  {searchOpenChatMatches.length ? (
                    <div className="overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)]">
                      {searchOpenChatMatches.map((group) => (
                        <OpenGroupSearchRow
                          key={`search-open-${group.id}`}
                          group={group}
                          keyword={keyword}
                          onCommitRecentSearch={onCommitRecentSearch}
                          onClose={onClose}
                          onSelectOpenGroup={onSelectOpenGroup}
                          onOpenMenu={() => setAction({ kind: "open", group })}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyHint>{t("cm_ui_no_matching_meetings")}</EmptyHint>
                  )}
                </MessengerSearchSection>
                <MessengerSearchSection title={t("cm_ui_message")}>
                  {searchMessageMatches.length ? (
                    <div className="overflow-hidden rounded-[length:var(--overlay-radius-md)] border border-[color:var(--overlay-border)] bg-[color:var(--overlay-surface)]">
                      {searchMessageMatches.map((item) => (
                        <MessageHitRow
                          key={`search-message-${item.room.id}`}
                          item={item}
                          keyword={keyword}
                          onCommitRecentSearch={onCommitRecentSearch}
                          onClose={onClose}
                          onSelectMessageRoom={onSelectMessageRoom}
                          onOpenMenu={() => setAction({ kind: "message", item })}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyHint>{t("cm_ui_no_matching_messages")}</EmptyHint>
                  )}
                </MessengerSearchSection>
              </>
            )}
          </div>
          <button
            type="button"
            className="dibay-overlay-btn dibay-overlay-btn--text !flex-none mt-2"
            onClick={onClose}
          >
            {t("nav_close")}
          </button>
        </div>
      </MessengerHomeBottomSheetShell>
      {action ? (
        <SearchActionsSheet
          action={action}
          keyword={keyword}
          onDismiss={dismissAction}
          onCommitRecentSearch={onCommitRecentSearch}
          onRemoveRecentSearch={onRemoveRecentSearch}
          onClose={onClose}
          onKeywordChange={onKeywordChange}
          onSelectFriend={onSelectFriend}
          onSelectOpenGroup={onSelectOpenGroup}
          onSelectMessageRoom={onSelectMessageRoom}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
          onMarkRead={onMarkRead}
          onToggleArchive={onToggleArchive}
        />
      ) : null}
    </>
  );
}
