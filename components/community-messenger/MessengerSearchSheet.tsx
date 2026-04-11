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
    <div className="rounded-ui-rect border border-ui-border bg-ui-surface px-4 py-8 text-center text-[13px] text-ui-muted">
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
      <h3 className="mb-2 text-[12px] font-semibold text-ui-muted">{title}</h3>
      {subtitle ? <p className="-mt-1 mb-2 text-[11px] text-ui-muted">{subtitle}</p> : null}
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
      <div className="rounded-t-[12px] border border-ui-border bg-ui-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[var(--ui-shadow-card)]">
        <p className="text-center text-[14px] font-semibold text-ui-fg">메신저 검색</p>
        <input
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onCommitRecentSearch(keyword);
            }
          }}
          placeholder="친구, 채팅방, 메시지, 오픈채팅 검색"
          className="mt-4 h-11 w-full rounded-ui-rect border border-ui-border bg-ui-surface px-3 text-[14px] text-ui-fg outline-none placeholder:text-ui-muted focus:border-ui-border"
        />
        <div className="mt-3 space-y-4">
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
              <MessengerSearchSection title="친구" subtitle="프로필을 열고 바로 대화나 관리 액션으로 이어집니다.">
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
                        className="flex w-full items-center justify-between gap-3 border-b border-ui-border px-3 py-3 text-left last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[14px] font-medium text-gray-900">{friend.label}</p>
                            <span className="rounded-ui-rect border border-ui-border bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              친구
                            </span>
                            {friend.isFavoriteFriend ? (
                              <span className="rounded-ui-rect border border-ui-border bg-ui-surface px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                즐겨찾기
                              </span>
                            ) : null}
                            {friend.isHiddenFriend ? (
                              <span className="rounded-ui-rect border border-ui-border bg-ui-surface px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                숨김
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-[12px] text-gray-500">{friend.subtitle ?? "친구"}</p>
                        </div>
                        <span className="text-[11px] text-gray-400">프로필</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <MessengerEmptyCard message="일치하는 친구가 없습니다." />
                )}
              </MessengerSearchSection>
              <MessengerSearchSection title="채팅방" subtitle="현재 참여 중인 대화방을 바로 엽니다.">
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
              <MessengerSearchSection title="그룹·오픈채팅" subtitle="공개방 미리보기 후 입장">
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
                        className="flex w-full items-center justify-between gap-3 border-b border-ui-border px-3 py-3 text-left last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[14px] font-medium text-gray-900">{group.title}</p>
                            <span className="rounded-ui-rect border border-ui-border bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              오픈
                            </span>
                            {group.isJoined ? (
                              <span className="rounded-ui-rect border border-ui-border bg-ui-surface px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                                참여 중
                              </span>
                            ) : null}
                          </div>
                          <p className="truncate text-[12px] text-gray-500">{group.summary || `${group.ownerLabel} · ${group.memberCount}명`}</p>
                          <p className="mt-1 truncate text-[11px] text-gray-400">
                            {group.ownerLabel} · {group.memberCount}명
                          </p>
                        </div>
                        <span className="text-[11px] text-gray-400">{group.isJoined ? "다시 입장" : "미리보기"}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <MessengerEmptyCard message="일치하는 그룹·오픈채팅이 없습니다." />
                )}
              </MessengerSearchSection>
              <MessengerSearchSection title="메시지" subtitle="미리보기에 검색어가 포함된 대화">
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
                        className="flex w-full items-center justify-between gap-3 border-b border-ui-border px-3 py-3 text-left last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[13px] font-medium text-gray-900">{item.room.title}</p>
                            <span className="rounded-ui-rect border border-ui-border bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              {getRoomTypeBadgeLabel(item.room)}
                            </span>
                            <span className="rounded-ui-rect border border-ui-border bg-ui-surface px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                              메시지
                            </span>
                          </div>
                          <p className="truncate text-[12px] text-gray-500">{item.preview}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[11px] text-gray-400">{formatConversationTimestamp(item.lastEventAt)}</p>
                          <p className="mt-1 text-[10px] text-gray-300">열기</p>
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
        <button type="button" className="mt-3 w-full py-2 text-[14px] text-ui-muted" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
