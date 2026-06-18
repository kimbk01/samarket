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
    <p className="rounded-[var(--messenger-radius-sm)] bg-[color:var(--messenger-surface-muted)] py-2 px-2 sam-text-xxs leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
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
      <h3 className="sam-text-xxs font-semibold uppercase tracking-wide" style={{ color: "var(--messenger-text-secondary)" }}>
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
  const row =
    "w-full rounded-ui-rect px-4 py-3 text-left text-[14px] font-normal leading-[1.5] text-[color:var(--messenger-text)] active:bg-[color:var(--messenger-primary-soft)]";

  return (
    <MessengerHomeBottomSheetShell
      onClose={onDismiss}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={t("cm_ui_chat_actions")}
      panelClassName="rounded-t-ui-rect border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] pb-3 shadow-[var(--messenger-shadow-soft)]"
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
          className="mt-1 w-full border-t border-[color:var(--messenger-divider)] py-2.5 text-[14px] font-semibold text-[color:var(--messenger-text-secondary)]"
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
      className="rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-2.5 py-1.5 text-[12px] font-normal leading-[1.4] active:bg-[color:var(--messenger-primary-soft)]"
      style={{ color: "var(--messenger-text)" }}
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
      className="flex w-full items-center justify-between gap-2 border-b border-[color:var(--messenger-divider)] px-2.5 py-2 text-left last:border-b-0 active:bg-[color:var(--messenger-primary-soft)]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate sam-text-body-secondary font-medium text-[color:var(--messenger-text)]">{friend.label}</p>
          <span className="rounded-ui-rect bg-[color:var(--messenger-primary-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--messenger-primary)]">
            {t("nav_messenger_friend")}
          </span>
          {friend.isFavoriteFriend ? (
            <span className="rounded-ui-rect bg-[color:var(--messenger-surface-muted)] px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--messenger-text-secondary)]">
              ★
            </span>
          ) : null}
          {friend.isHiddenFriend ? (
            <span className="rounded-ui-rect bg-[color:var(--messenger-surface-muted)] px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--messenger-text-secondary)]">
              {t("common_hide")}
            </span>
          ) : null}
        </div>
        <p className="truncate sam-text-xxs text-[color:var(--messenger-text-secondary)]">{friend.subtitle ?? ""}</p>
      </div>
      <span className="sam-text-xxs text-[color:var(--messenger-text-secondary)]">{t("cm_ui_open")}</span>
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
      className="flex w-full items-center justify-between gap-2 border-b border-[color:var(--messenger-divider)] px-2.5 py-2 text-left last:border-b-0 active:bg-[color:var(--messenger-primary-soft)]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate sam-text-body-secondary font-medium text-[color:var(--messenger-text)]">{group.title}</p>
          <span className="rounded-full bg-[color:var(--messenger-badge-openchat-bg)] px-1.5 py-0.5 sam-text-xxs font-semibold text-sky-800">
            {t("nav_messenger_open_group")}
          </span>
          {group.isJoined ? (
            <span className="rounded-full bg-[color:var(--messenger-primary-soft)] px-1.5 py-0.5 sam-text-xxs font-medium text-[color:var(--messenger-primary)]">
              {t("cm_ui_joined")}
            </span>
          ) : null}
        </div>
        <p className="truncate sam-text-xxs text-[color:var(--messenger-text-secondary)]">
          {group.summary || `${group.regionText || group.ownerLabel} · ${group.categoryText || t("nav_messenger_open_group")} · ${t("nav_chat_count_people", { count: group.memberCount })}`}
        </p>
      </div>
      <span className="sam-text-xxs font-medium text-[color:var(--messenger-primary)]">
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
      className="flex w-full items-center justify-between gap-2 border-b border-[color:var(--messenger-divider)] px-2.5 py-2 text-left last:border-b-0 active:bg-[color:var(--messenger-primary-soft)]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate sam-text-body-secondary font-medium text-[color:var(--messenger-text)]">{item.room.title}</p>
          <span className="rounded-full bg-[color:var(--messenger-primary-soft)] px-1.5 py-0.5 sam-text-xxs font-medium text-[color:var(--messenger-primary)]">
            {getRoomTypeBadgeLabel(item.room)}
          </span>
        </div>
        <p className="truncate sam-text-xxs text-[color:var(--messenger-text-secondary)]">{item.preview}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="sam-text-xxs tabular-nums text-[color:var(--messenger-text-secondary)]">{formatConversationTimestamp(item.lastEventAt)}</p>
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
        panelClassName="rounded-t-[var(--messenger-radius-md)] border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]"
      >
        <div
          data-messenger-shell
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-2"
        >
          <p className="text-center sam-text-body font-semibold" style={{ color: "var(--messenger-text)" }}>
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
            className="mt-2 min-h-[var(--ui-tap-min)] w-full rounded-[var(--messenger-radius-md)] border border-transparent bg-[color:var(--messenger-primary-soft)] px-2.5 sam-text-body outline-none transition-[box-shadow,border-color] placeholder:text-[color:var(--messenger-text-secondary)] focus:border-[color:var(--messenger-primary)] focus:bg-[color:var(--messenger-surface)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
            style={{ color: "var(--messenger-text)" }}
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
                    <div className="overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] shadow-[var(--messenger-shadow-soft)]">
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
                      className="space-y-1.5 rounded-[var(--messenger-radius-md)] p-0.5"
                      style={{ backgroundColor: "var(--messenger-surface-muted)" }}
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
                    <div className="overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] shadow-[var(--messenger-shadow-soft)]">
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
                    <div className="overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] shadow-[var(--messenger-shadow-soft)]">
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
            className="mt-2 w-full py-2 sam-text-body-secondary"
            style={{ color: "var(--messenger-text-secondary)" }}
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
