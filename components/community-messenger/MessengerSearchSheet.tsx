"use client";

import type { ReactNode } from "react";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";
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

export function MessengerEmptyCard({ message }: { message: string }) {
  return (
    <div className="rounded-ui-rect border border-dashed border-ui-border bg-ui-page px-3 py-4 text-center text-[12px] text-ui-muted">
      {message}
    </div>
  );
}

function MessengerSearchSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ui-muted">{title}</h3>
      {subtitle ? <p className="mb-1 text-[11px] text-ui-muted">{subtitle}</p> : null}
      {children}
    </section>
  );
}

type Props = {
  keyword: string;
  onKeywordChange: (next: string) => void;
  onClose: () => void;
  onCommitRecentSearch: (value: string) => void;
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

export function MessengerSearchSheet({
  keyword,
  onKeywordChange,
  onClose,
  onCommitRecentSearch,
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
  return (
    <div className="fixed inset-0 z-[42] flex flex-col justify-end bg-black/25">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label="닫기" onClick={onClose} />
      <div className="max-h-[78vh] overflow-y-auto rounded-t-[12px] border border-ui-border bg-ui-surface px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[var(--ui-shadow-card)]">
        <p className="text-center text-[15px] font-semibold text-ui-fg">검색</p>
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
          className="mt-2 h-10 w-full rounded-ui-rect border border-ui-border bg-ui-page px-2.5 text-[14px] text-ui-fg outline-none placeholder:text-ui-muted"
        />
        <div className="mt-2 space-y-3">
          {!queryActive ? (
            <MessengerSearchSection title="최근 검색">
              {recentSearches.length ? (
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onKeywordChange(k)}
                      className="rounded-ui-rect border border-ui-border bg-ui-surface px-3 py-2 text-[12px] text-ui-fg"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              ) : (
                <MessengerEmptyCard message="최근 검색이 없습니다." />
              )}
            </MessengerSearchSection>
          ) : (
            <>
              <MessengerSearchSection title="친구">
                {searchFriendMatches.length ? (
                  <div className="overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
                    {searchFriendMatches.map((friend) => (
                      <button
                        key={`friend-search-${friend.id}`}
                        type="button"
                        onClick={() => {
                          onCommitRecentSearch(keyword);
                          onClose();
                          onSelectFriend(friend);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-ui-border px-2.5 py-2 text-left last:border-b-0 hover:bg-ui-hover"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[13px] font-medium text-ui-fg">{friend.label}</p>
                            <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] font-medium text-ui-muted">친구</span>
                            {friend.isFavoriteFriend ? (
                              <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] text-ui-muted">★</span>
                            ) : null}
                            {friend.isHiddenFriend ? (
                              <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] text-ui-muted">숨김</span>
                            ) : null}
                          </div>
                          <p className="truncate text-[11px] text-ui-muted">{friend.subtitle ?? ""}</p>
                        </div>
                        <span className="text-[10px] text-ui-muted">열기</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <MessengerEmptyCard message="일치하는 친구가 없습니다." />
                )}
              </MessengerSearchSection>
              <MessengerSearchSection title="채팅방">
                {searchRoomMatches.length ? (
                  <div className="overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
                    {searchRoomMatches.map((item) => (
                      <MessengerChatListItem
                        key={`search-room-${item.room.id}`}
                        item={item}
                        favoriteFriendIds={favoriteFriendIds}
                        busyId={busyId}
                        onTogglePin={onTogglePin}
                        onToggleMute={onToggleMute}
                        onMarkRead={onMarkRead}
                        onToggleArchive={onToggleArchive}
                        compact
                      />
                    ))}
                  </div>
                ) : (
                  <MessengerEmptyCard message="일치하는 채팅방이 없습니다." />
                )}
              </MessengerSearchSection>
              <MessengerSearchSection title="오픈채팅">
                {searchOpenChatMatches.length ? (
                  <div className="overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
                    {searchOpenChatMatches.map((group) => (
                      <button
                        key={`search-open-${group.id}`}
                        type="button"
                        onClick={() => {
                          onCommitRecentSearch(keyword);
                          onClose();
                          onSelectOpenGroup(group.id);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-ui-border px-2.5 py-2 text-left last:border-b-0 hover:bg-ui-hover"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[13px] font-medium text-ui-fg">{group.title}</p>
                            <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] text-ui-muted">오픈</span>
                            {group.isJoined ? (
                              <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] text-ui-muted">참여</span>
                            ) : null}
                          </div>
                          <p className="truncate text-[11px] text-ui-muted">{group.summary || `${group.ownerLabel} · ${group.memberCount}명`}</p>
                        </div>
                        <span className="text-[10px] text-ui-muted">{group.isJoined ? "입장" : "보기"}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <MessengerEmptyCard message="일치하는 그룹·오픈채팅이 없습니다." />
                )}
              </MessengerSearchSection>
              <MessengerSearchSection title="메시지">
                {searchMessageMatches.length ? (
                  <div className="overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
                    {searchMessageMatches.map((item) => (
                      <button
                        key={`search-message-${item.room.id}`}
                        type="button"
                        onClick={() => {
                          onCommitRecentSearch(keyword);
                          onClose();
                          onSelectMessageRoom(item.room.id);
                        }}
                        className="flex w-full items-center justify-between gap-2 border-b border-ui-border px-2.5 py-2 text-left last:border-b-0 hover:bg-ui-hover"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[13px] font-medium text-ui-fg">{item.room.title}</p>
                            <span className="rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] text-ui-muted">
                              {getRoomTypeBadgeLabel(item.room)}
                            </span>
                          </div>
                          <p className="truncate text-[11px] text-ui-muted">{item.preview}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[10px] text-ui-muted tabular-nums">{formatConversationTimestamp(item.lastEventAt)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <MessengerEmptyCard message="일치하는 메시지가 없습니다." />
                )}
              </MessengerSearchSection>
            </>
          )}
        </div>
        <button type="button" className="mt-2 w-full py-2 text-[13px] text-ui-muted" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
