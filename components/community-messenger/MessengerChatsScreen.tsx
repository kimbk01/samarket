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
  return `shrink-0 rounded-ui-rect border px-2.5 py-1 text-[11px] font-medium touch-manipulation ${
    active ? "border-ui-fg bg-ui-page text-ui-fg" : "border-transparent bg-ui-hover text-ui-muted"
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
    <section className="pt-2">
      {showFilters ? (
        <div className="mb-2 space-y-1.5">
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ui-muted">목록</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
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
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-ui-muted">유형</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
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
        <div className="divide-y divide-ui-border overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
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
        <div className="rounded-ui-rect border border-dashed border-ui-border px-3 py-8 text-center text-[12px] leading-relaxed text-ui-muted">
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
    <section className="space-y-4 pt-2">
      <p className="px-0.5 text-[12px] leading-snug text-ui-muted">공개 오픈채팅만 표시합니다. 입장 전 미리보기를 확인하세요.</p>

      <div>
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ui-muted">참여 중</h2>
          <span className="text-[11px] text-ui-muted tabular-nums">{joinedItems.length}</span>
        </div>
        {joinedItems.length ? (
          <div className="divide-y divide-ui-border overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
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
          <div className="rounded-ui-rect border border-dashed border-ui-border px-3 py-6 text-center text-[12px] text-ui-muted">참여 중인 오픈채팅이 없습니다.</div>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ui-muted">찾기</h2>
          <span className="text-[11px] text-ui-muted tabular-nums">{discoverableGroups.length}</span>
        </div>
        <div className="divide-y divide-ui-border overflow-hidden rounded-ui-rect border border-ui-border bg-ui-surface">
          {discoverableGroups.length ? (
            discoverableGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onPreviewGroup(group.id)}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2.5 text-left hover:bg-ui-hover"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-[13px] font-medium text-ui-fg">{group.title}</p>
                    <span className="shrink-0 rounded-ui-rect border border-ui-border px-1 py-0.5 text-[9px] font-medium text-ui-muted">오픈</span>
                    {group.isJoined ? (
                      <span className="shrink-0 rounded-ui-rect border border-ui-border bg-ui-page px-1 py-0.5 text-[9px] text-ui-muted">참여</span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] text-ui-muted">{group.summary || `${group.ownerLabel} · ${group.memberCount}명`}</p>
                </div>
                <span className="shrink-0 text-[11px] text-ui-muted">{group.isJoined ? "입장" : "보기"}</span>
              </button>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-[12px] text-ui-muted">표시할 오픈채팅이 없습니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}
