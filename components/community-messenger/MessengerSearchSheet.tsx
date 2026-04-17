"use client";

import { useCallback, useState, type ReactNode } from "react";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";
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
    <p className="rounded-[var(--messenger-radius-sm)] bg-[color:var(--messenger-surface-muted)] py-2 px-2 text-[11px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
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
      <h3 className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--messenger-text-secondary)" }}>
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
  const row =
    "w-full rounded-[var(--messenger-radius-md)] px-4 py-3 text-left text-[15px] text-[color:var(--messenger-text)] active:bg-[color:var(--messenger-primary-soft)]";

  return (
    <div className="fixed inset-0 z-[44] flex flex-col justify-end bg-black/30" role="dialog" aria-modal="true">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onDismiss} />
      <div
        data-messenger-shell
        className="rounded-t-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[var(--messenger-shadow-soft)]"
      >
        {action.kind === "recent" ? (
          <nav className="flex flex-col p-1" aria-label="최근 검색 작업">
            <button
              type="button"
              className={row}
              onClick={() => {
                onKeywordChange(action.term);
                onDismiss();
              }}
            >
              검색창에 넣기
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                onRemoveRecentSearch(action.term);
                onDismiss();
              }}
            >
              최근 검색에서 삭제
            </button>
          </nav>
        ) : null}
        {action.kind === "friend" ? (
          <nav className="flex flex-col p-1" aria-label="친구 검색 결과">
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
              프로필 열기
            </button>
          </nav>
        ) : null}
        {action.kind === "room" || action.kind === "message" ? (
          <nav className="flex flex-col p-1" aria-label="대화 작업">
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
              대화 열기
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                void onTogglePin(action.item.room);
                onDismiss();
              }}
            >
              {action.item.room.isPinned ? "고정 해제" : "대화 고정"}
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                void onToggleArchive(action.item.room);
                onDismiss();
              }}
            >
              {action.item.room.isArchivedByViewer ? "보관 해제" : "보관함으로"}
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                void onMarkRead(action.item.room);
                onDismiss();
              }}
            >
              읽음 처리
            </button>
            <button
              type="button"
              className={row}
              onClick={() => {
                void onToggleMute(action.item.room);
                onDismiss();
              }}
            >
              {action.item.room.isMuted ? "알림 켜기" : "알림 끄기"}
            </button>
          </nav>
        ) : null}
        {action.kind === "open" ? (
          <nav className="flex flex-col p-1" aria-label="오픈채팅">
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
              열기
            </button>
          </nav>
        ) : null}
        <button
          type="button"
          className="mt-1 w-full border-t border-[color:var(--messenger-divider)] py-2.5 text-[14px] text-[color:var(--messenger-text-secondary)]"
          onClick={onDismiss}
        >
          취소
        </button>
      </div>
    </div>
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
      className="rounded-full border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)] px-2.5 py-1.5 text-[12px] active:bg-[color:var(--messenger-primary-soft)]"
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
          <p className="truncate text-[13px] font-medium text-[color:var(--messenger-text)]">{friend.label}</p>
          <span className="rounded-full bg-[color:var(--messenger-primary-soft)] px-1.5 py-0.5 text-[9px] font-semibold text-[color:var(--messenger-primary)]">
            친구
          </span>
          {friend.isFavoriteFriend ? (
            <span className="rounded-full bg-[color:var(--messenger-surface-muted)] px-1.5 py-0.5 text-[9px] text-[color:var(--messenger-text-secondary)]">
              ★
            </span>
          ) : null}
          {friend.isHiddenFriend ? (
            <span className="rounded-full bg-[color:var(--messenger-surface-muted)] px-1.5 py-0.5 text-[9px] text-[color:var(--messenger-text-secondary)]">
              숨김
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11px] text-[color:var(--messenger-text-secondary)]">{friend.subtitle ?? ""}</p>
      </div>
      <span className="text-[10px] text-[color:var(--messenger-text-secondary)]">열기</span>
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
          <p className="truncate text-[13px] font-medium text-[color:var(--messenger-text)]">{group.title}</p>
          <span className="rounded-full bg-[color:var(--messenger-badge-openchat-bg)] px-1.5 py-0.5 text-[9px] font-semibold text-sky-800">
            오픈
          </span>
          {group.isJoined ? (
            <span className="rounded-full bg-[color:var(--messenger-primary-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[color:var(--messenger-primary)]">
              참여
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11px] text-[color:var(--messenger-text-secondary)]">
          {group.summary || `${group.ownerLabel} · ${group.memberCount}명`}
        </p>
      </div>
      <span className="text-[10px] font-medium text-[color:var(--messenger-primary)]">{group.isJoined ? "입장" : "보기"}</span>
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
          <p className="truncate text-[13px] font-medium text-[color:var(--messenger-text)]">{item.room.title}</p>
          <span className="rounded-full bg-[color:var(--messenger-primary-soft)] px-1.5 py-0.5 text-[9px] font-medium text-[color:var(--messenger-primary)]">
            {getRoomTypeBadgeLabel(item.room)}
          </span>
        </div>
        <p className="truncate text-[11px] text-[color:var(--messenger-text-secondary)]">{item.preview}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[10px] tabular-nums text-[color:var(--messenger-text-secondary)]">{formatConversationTimestamp(item.lastEventAt)}</p>
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
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onSelectFriend,
  onSelectOpenGroup,
  onSelectMessageRoom,
}: Props) {
  const [action, setAction] = useState<SearchSheetAction | null>(null);

  const openRoomMenu = useCallback((item: UnifiedRoomListItem) => {
    setAction({ kind: "room", item });
  }, []);

  const dismissAction = useCallback(() => setAction(null), []);

  return (
    <>
      <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/25">
        <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
        <div
          data-messenger-shell
          className="max-h-[min(82vh,640px)] overflow-y-auto rounded-t-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[var(--messenger-shadow-soft)]"
        >
          <p className="text-center text-[15px] font-semibold" style={{ color: "var(--messenger-text)" }}>
            검색
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
            placeholder="친구, 방, 메시지, 오픈채팅"
            className="mt-2 min-h-[var(--ui-tap-min)] w-full rounded-[var(--messenger-radius-md)] border border-transparent bg-[color:var(--messenger-primary-soft)] px-2.5 text-[14px] outline-none transition-[box-shadow,border-color] placeholder:text-[color:var(--messenger-text-secondary)] focus:border-[color:var(--messenger-primary)] focus:bg-[color:var(--messenger-surface)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
            style={{ color: "var(--messenger-text)" }}
          />
          <div className="mt-2 space-y-2.5">
            {!queryActive ? (
              <MessengerSearchSection title="최근 검색">
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
                  <EmptyHint>최근 검색이 없습니다.</EmptyHint>
                )}
              </MessengerSearchSection>
            ) : (
              <>
                <MessengerSearchSection title="친구">
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
                    <EmptyHint>일치하는 친구가 없습니다.</EmptyHint>
                  )}
                </MessengerSearchSection>
                <MessengerSearchSection title="채팅방">
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
                    <EmptyHint>일치하는 채팅방이 없습니다.</EmptyHint>
                  )}
                </MessengerSearchSection>
                <MessengerSearchSection title="오픈채팅">
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
                    <EmptyHint>일치하는 오픈채팅이 없습니다.</EmptyHint>
                  )}
                </MessengerSearchSection>
                <MessengerSearchSection title="메시지">
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
                    <EmptyHint>일치하는 메시지가 없습니다.</EmptyHint>
                  )}
                </MessengerSearchSection>
              </>
            )}
          </div>
          <button
            type="button"
            className="mt-2 w-full py-2 text-[13px]"
            style={{ color: "var(--messenger-text-secondary)" }}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
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
