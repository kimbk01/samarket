"use client";

import type {
  MessengerChatInboxFilter,
  MessengerChatKindFilter,
} from "@/lib/community-messenger/messenger-ia";
import { messengerChatInboxFilterLabel, messengerChatKindFilterLabel } from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";

const CHAT_INBOX_ORDER: MessengerChatInboxFilter[] = ["all", "unread", "pinned"];
const CHAT_KIND_ORDER: MessengerChatKindFilter[] = ["all", "direct", "private_group", "trade", "delivery"];

function chipClass(active: boolean): string {
  return `shrink-0 rounded-ui-rect border px-3 py-2 text-[12px] font-medium touch-manipulation ${
    active ? "border-ui-primary bg-ui-page text-ui-primary" : "border-ui-border bg-ui-surface text-ui-muted"
  }`;
}

type Props = {
  items: UnifiedRoomListItem[];
  favoriteFriendIds: Set<string>;
  busyId: string | null;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  onChatInboxFilterChange: (next: MessengerChatInboxFilter) => void;
  onChatKindFilterChange: (next: MessengerChatKindFilter) => void;
  totalUnreadCount: number;
  emptyMessage: string;
  showFilters?: boolean;
};

export function MessengerChatsScreen({
  items,
  favoriteFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  chatInboxFilter,
  chatKindFilter,
  onChatInboxFilterChange,
  onChatKindFilterChange,
  totalUnreadCount,
  emptyMessage,
  showFilters = true,
}: Props) {
  return (
    <section className="pt-3">
      {showFilters ? (
        <div className="mb-3 space-y-2">
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-ui-muted">목록</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {CHAT_INBOX_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChatInboxFilterChange(id)}
                  className={chipClass(chatInboxFilter === id)}
                >
                  {id === "unread" ? (
                    <span className="flex items-center gap-1">
                      {messengerChatInboxFilterLabel(id)}
                      {totalUnreadCount > 0 ? (
                        <span className="min-w-[18px] rounded-ui-rect border border-ui-border bg-ui-surface px-1.5 py-0.5 text-[10px] font-semibold text-ui-fg">
                          {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    messengerChatInboxFilterLabel(id)
                  )}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-ui-muted">대화 유형</p>
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {CHAT_KIND_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChatKindFilterChange(id)}
                  className={chipClass(chatKindFilter === id)}
                >
                  {messengerChatKindFilterLabel(id)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {items.length ? (
        <div className="overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
          {items.map((item) => (
            <MessengerChatListItem
              key={item.room.id}
              item={item}
              favoriteFriendIds={favoriteFriendIds}
              busyId={busyId}
              onTogglePin={onTogglePin}
              onToggleMute={onToggleMute}
              onMarkRead={onMarkRead}
              onToggleArchive={(room) => onToggleArchive(room)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-ui-rect border border-dashed border-ui-border px-4 py-10 text-center text-[13px] leading-relaxed text-ui-muted">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}

export function MessengerOpenChatScreen({
  joinedItems,
  discoverableGroups,
  favoriteFriendIds,
  busyId,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onPreviewGroup,
}: {
  joinedItems: UnifiedRoomListItem[];
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
}) {
  return (
    <section className="space-y-5 pt-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-ui-rect border border-gray-200 bg-white px-4 py-3">
          <p className="text-[11px] font-medium text-gray-500">내 오픈채팅</p>
          <p className="mt-1 text-[13px] text-gray-600">참여 중인 공개방만 표시합니다.</p>
        </div>
        <div className="rounded-ui-rect border border-gray-200 bg-white px-4 py-3">
          <p className="text-[11px] font-medium text-gray-500">탐색</p>
          <p className="mt-1 text-[13px] text-gray-600">미리보기 후 입장합니다.</p>
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-gray-900">참여 중인 오픈채팅</h2>
          <span className="text-[12px] text-gray-400">{joinedItems.length}</span>
        </div>
        {joinedItems.length ? (
          <div className="overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
            {joinedItems.map((item) => (
              <MessengerChatListItem
                key={item.room.id}
                item={item}
                favoriteFriendIds={favoriteFriendIds}
                busyId={busyId}
                onTogglePin={onTogglePin}
                onToggleMute={onToggleMute}
                onMarkRead={onMarkRead}
                onToggleArchive={(room) => onToggleArchive(room)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-ui-rect border border-dashed border-gray-200 px-4 py-8 text-center text-[13px] text-gray-500">참여 중인 오픈채팅이 없습니다.</div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-gray-900">오픈채팅 찾기</h2>
          <span className="text-[12px] text-gray-400">{discoverableGroups.length}</span>
        </div>
        <div className="overflow-hidden rounded-ui-rect border border-gray-200 bg-white">
          {discoverableGroups.length ? (
            discoverableGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onPreviewGroup(group.id)}
                className="flex w-full items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 text-left last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[14px] font-medium text-gray-900">{group.title}</p>
                    <span className="rounded-ui-rect border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">오픈</span>
                    {group.isJoined ? (
                      <span className="rounded-ui-rect border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-gray-600">참여 중</span>
                    ) : null}
                  </div>
                  <p className="truncate text-[12px] text-gray-500">{group.summary || `${group.ownerLabel} · ${group.memberCount}명`}</p>
                  <p className="mt-1 truncate text-[11px] text-gray-400">{group.ownerLabel} · {group.memberCount}명</p>
                </div>
                <span className="shrink-0 text-[12px] text-gray-400">{group.isJoined ? "다시 입장" : "미리보기"}</span>
              </button>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-[13px] text-gray-500">표시할 오픈채팅이 없습니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}
