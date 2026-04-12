"use client";

import {
  MESSENGER_CHAT_LIST_CHIP_ORDER,
  type MessengerChatListChip,
  type MessengerChatListContext,
  messengerChatListChipLabel,
} from "@/lib/community-messenger/messenger-ia";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import { MessengerChatListItem } from "@/components/community-messenger/MessengerChatListItem";

function chipClass(active: boolean): string {
  return `shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-tight touch-manipulation ${
    active ? "border-ui-fg/40 bg-ui-page text-ui-fg" : "border-transparent bg-ui-hover/70 text-ui-muted"
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
  onOpenRoomActions?: (item: UnifiedRoomListItem, listContext: MessengerChatListContext) => void;
  chatListChip: MessengerChatListChip;
  onChatListChipChange: (next: MessengerChatListChip) => void;
  emptyMessage: string;
  showFilters?: boolean;
  listContext?: MessengerChatListContext;
};

export function MessengerChatsScreen({
  items,
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
}: Props) {
  return (
    <section className="pt-1">
      {showFilters ? (
        <div className="mb-1 flex gap-1 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MESSENGER_CHAT_LIST_CHIP_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onChatListChipChange(id)}
              className={chipClass(chatListChip === id)}
            >
              {messengerChatListChipLabel(id)}
            </button>
          ))}
        </div>
      ) : null}

      {items.length ? (
        <div className="divide-y divide-ui-border/80 bg-ui-surface">
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
              listContext={listContext}
              onOpenRoomActions={onOpenRoomActions}
            />
          ))}
        </div>
      ) : (
        <div className="px-1 py-6 text-center text-[13px] leading-snug text-ui-muted whitespace-pre-line">
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
  onOpenRoomActions,
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
  onOpenRoomActions?: (item: UnifiedRoomListItem, listContext: MessengerChatListContext) => void;
}) {
  return (
    <section className="space-y-3 pt-1.5">
      <p className="px-0.5 text-[11px] leading-snug text-ui-muted">공개 오픈채팅만 표시합니다. 입장 전 미리보기를 확인하세요.</p>

      <div>
        <div className="mb-1 px-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ui-muted">참여 중</h2>
        </div>
        {joinedItems.length ? (
          <div className="divide-y divide-ui-border/80 bg-ui-surface">
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
                listContext="default"
                onOpenRoomActions={onOpenRoomActions}
              />
            ))}
          </div>
        ) : (
          <div className="px-1 py-4 text-center text-[12px] text-ui-muted">참여 중인 오픈채팅이 없습니다.</div>
        )}
      </div>

      <div>
        <div className="mb-1 px-0.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ui-muted">찾기</h2>
        </div>
        <div className="divide-y divide-ui-border/80 bg-ui-surface">
          {discoverableGroups.length ? (
            discoverableGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onPreviewGroup(group.id)}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left active:bg-ui-hover"
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
            <div className="px-3 py-4 text-center text-[12px] text-ui-muted">표시할 오픈채팅이 없습니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}
