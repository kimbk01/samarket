"use client";

import type { MutableRefObject } from "react";
import { memo, useMemo } from "react";
import type { MessengerMenuAnchorRect } from "@/components/community-messenger/MessengerChatListItem";
import { MessengerChatsScreen, MessengerOpenChatScreen } from "@/components/community-messenger/MessengerChatsScreen";
import { MessengerArchiveScreen } from "@/components/community-messenger/MessengerArchiveScreen";
import { MessengerFriendsScreen } from "@/components/community-messenger/MessengerFriendsScreen";
import { MessengerPrimarySectionNav } from "@/components/community-messenger/MessengerPrimarySectionNav";
import {
  inboxKindToChatListChip,
  messengerChatListEmptyMessageForChip,
  type MessengerArchiveSection,
  type MessengerChatInboxFilter,
  type MessengerChatKindFilter,
  type MessengerChatListChip,
  type MessengerChatListContext,
  type MessengerMainSection,
} from "@/lib/community-messenger/messenger-ia";
import type {
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { useSwipeTabNavigation } from "@/lib/ui/use-swipe-tab-navigation";

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  openedSwipeItemId: string | null;
  openedMenuItemId: string | null;
  friendQuickMenuBlocksTabSwipeRef: MutableRefObject<boolean>;
  messengerOverlayGeneration: number;
  selectedArchiveSection: MessengerArchiveSection | null;
  pendingCallTarget: string | null;
  isScrolling: boolean;
  onResetTransientUi: MessengerResetTransientUiFn;
  onListScrollStart: () => void;
  onOpenMenuItem: (id: string) => void;
  onCloseMenuItem: (id?: string) => void;
  onOpenSwipeItem: (id: string | null) => void;
  onSelectArchiveSection: (section: MessengerArchiveSection | null) => void;
  me: CommunityMessengerProfileLite | null;
  viewerUserId?: string | null;
  sortedFriends: CommunityMessengerProfileLite[];
  friendStateModel: MessengerFriendStateModel;
  busyId: string | null;
  onOpenFriendsPrivacySummary: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onToggleFavoriteFriend: (userId: string) => void;
  onFriendSwipeHide: (userId: string) => void;
  onFriendSwipeRemove: (userId: string) => void;
  onFriendSwipeBlock: (userId: string) => void;
  onFriendRowChat: (userId: string) => void;
  onFriendRowVoiceCall: (userId: string) => void;
  onFriendRowVideoCall: (userId: string) => void;
  getFriendDirectRoomMuted: (userId: string) => boolean | undefined;
  getFriendDirectRoomKind: (userId: string) => "trade" | "delivery" | null;
  friendNotificationsBusy: (userId: string) => boolean;
  onFriendToggleRoomMute: (userId: string) => void;
  friendHasDirectRoom: (userId: string) => boolean;
  primaryListItems: UnifiedRoomListItem[];
  favoriteFriendIds: Set<string>;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onOpenRoomActions?: (
    item: UnifiedRoomListItem,
    listContext: MessengerChatListContext,
    anchorRect: MessengerMenuAnchorRect | null
  ) => void;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  onChatListChipChange: (next: MessengerChatListChip) => void;
  openChatJoinedItems: UnifiedRoomListItem[];
  filteredDiscoverableGroups: CommunityMessengerDiscoverableGroupSummary[];
  onPreviewOpenGroup: (groupId: string) => void;
  incomingRequestCount: number;
};

export const MessengerHomeMainSections = memo(function MessengerHomeMainSections({
  mainSection,
  onPrimarySectionChange,
  openedSwipeItemId,
  openedMenuItemId,
  friendQuickMenuBlocksTabSwipeRef,
  messengerOverlayGeneration,
  selectedArchiveSection,
  pendingCallTarget,
  isScrolling,
  onResetTransientUi,
  onListScrollStart,
  onOpenMenuItem,
  onCloseMenuItem,
  onOpenSwipeItem,
  onSelectArchiveSection,
  me,
  viewerUserId = null,
  sortedFriends,
  friendStateModel,
  busyId,
  onOpenFriendsPrivacySummary,
  onOpenProfile,
  onToggleFavoriteFriend,
  onFriendSwipeHide,
  onFriendSwipeRemove,
  onFriendSwipeBlock,
  onFriendRowChat,
  onFriendRowVoiceCall,
  onFriendRowVideoCall,
  getFriendDirectRoomMuted,
  getFriendDirectRoomKind,
  friendNotificationsBusy,
  onFriendToggleRoomMute,
  friendHasDirectRoom,
  primaryListItems,
  favoriteFriendIds,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  onOpenRoomActions,
  chatInboxFilter,
  chatKindFilter,
  onChatListChipChange,
  openChatJoinedItems,
  filteredDiscoverableGroups,
  onPreviewOpenGroup,
  incomingRequestCount,
}: Props) {
  const chatListChip = inboxKindToChatListChip(chatInboxFilter, chatKindFilter);
  const swipeTabs = useMemo(
    () => [
      { href: "/community-messenger?section=friends" },
      { href: "/community-messenger?section=chats" },
      { href: "/community-messenger?section=open_chat" },
      { href: "/community-messenger?section=archive" },
    ],
    []
  );
  const activeIndex = useMemo(
    () => ["friends", "chats", "open_chat", "archive"].indexOf(mainSection),
    [mainSection]
  );
  const swipeHandlers = useSwipeTabNavigation(swipeTabs, activeIndex, (href) => {
    const q = new URLSearchParams(href.split("?")[1] ?? "");
    const nextSection = q.get("section") as MessengerMainSection | null;
    if (nextSection) onPrimarySectionChange(nextSection);
  });
  const sectionTitle =
    mainSection === "friends"
      ? "친구"
      : mainSection === "chats"
        ? "채팅"
        : mainSection === "open_chat"
          ? "오픈채팅"
          : "보관함";
  const sectionDescription =
    mainSection === "friends"
      ? "친구 목록과 프로필을 빠르게 관리하세요."
      : mainSection === "chats"
        ? "최근 대화와 안읽은 메시지를 모바일에 맞게 정리합니다."
        : mainSection === "open_chat"
          ? "참여 중인 방과 새 오픈채팅을 한곳에서 확인합니다."
          : "숨긴 대화와 보관한 채팅을 다시 꺼낼 수 있습니다.";

  return (
    <section className="space-y-3">
      <div className="space-y-2">
        <MessengerPrimarySectionNav value={mainSection} onChange={onPrimarySectionChange} />
        <div className="px-1">
          <p className="text-[20px] font-bold tracking-tight" style={{ color: "var(--messenger-text)" }}>
            {sectionTitle}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--messenger-text-secondary)" }}>
            {sectionDescription}
          </p>
        </div>
      </div>

      <div
        className="min-h-[56dvh]"
        data-messenger-scrolling={isScrolling ? "true" : "false"}
        data-messenger-pending-call={pendingCallTarget ? "true" : "false"}
        onTouchStart={(e) => {
          if (friendQuickMenuBlocksTabSwipeRef.current) return;
          swipeHandlers.onTouchStart(e);
        }}
        onTouchEnd={(e) => {
          if (friendQuickMenuBlocksTabSwipeRef.current) return;
          swipeHandlers.onTouchEnd(e);
        }}
      >
        {mainSection === "friends" ? (
          <MessengerFriendsScreen
            me={me}
            sortedFriends={sortedFriends}
            friendStateModel={friendStateModel}
            busyId={busyId}
            onOpenPrivacySummary={onOpenFriendsPrivacySummary}
            onOpenProfile={onOpenProfile}
            onToggleFavorite={onToggleFavoriteFriend}
            onFriendHide={onFriendSwipeHide}
            onFriendRemove={onFriendSwipeRemove}
            onFriendBlock={onFriendSwipeBlock}
            onFriendChat={onFriendRowChat}
            onFriendVoiceCall={onFriendRowVoiceCall}
            onFriendVideoCall={onFriendRowVideoCall}
            getFriendDirectRoomMuted={getFriendDirectRoomMuted}
            getFriendDirectRoomKind={getFriendDirectRoomKind}
            friendNotificationsBusy={friendNotificationsBusy}
            onFriendToggleRoomMute={onFriendToggleRoomMute}
            friendHasDirectRoom={friendHasDirectRoom}
            pendingCallTarget={pendingCallTarget}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
            messengerOverlayGeneration={messengerOverlayGeneration}
            friendQuickMenuBlocksTabSwipeRef={friendQuickMenuBlocksTabSwipeRef}
          />
        ) : null}

        {mainSection === "chats" ? (
          <MessengerChatsScreen
            items={primaryListItems}
            viewerUserId={viewerUserId}
            favoriteFriendIds={favoriteFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onOpenRoomActions={onOpenRoomActions}
            chatListChip={chatListChip}
            onChatListChipChange={onChatListChipChange}
            emptyMessage={messengerChatListEmptyMessageForChip(chatListChip)}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
            onListScrollStart={onListScrollStart}
          />
        ) : null}

        {mainSection === "open_chat" ? (
          <MessengerOpenChatScreen
            joinedItems={openChatJoinedItems}
            viewerUserId={viewerUserId}
            discoverableGroups={filteredDiscoverableGroups}
            favoriteFriendIds={favoriteFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onPreviewGroup={onPreviewOpenGroup}
            onOpenRoomActions={onOpenRoomActions}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
            onListScrollStart={onListScrollStart}
          />
        ) : null}

        {mainSection === "archive" ? (
          <MessengerArchiveScreen
            items={primaryListItems}
            viewerUserId={viewerUserId}
            favoriteFriendIds={favoriteFriendIds}
            busyId={busyId}
            onTogglePin={onTogglePin}
            onToggleMute={onToggleMute}
            onMarkRead={onMarkRead}
            onToggleArchive={onToggleArchive}
            onOpenRoomActions={onOpenRoomActions}
            chatListChip={chatListChip}
            onChatListChipChange={onChatListChipChange}
            listContext="archive"
            openedSwipeItemId={openedSwipeItemId}
            selectedArchiveSection={selectedArchiveSection}
            incomingRequestCount={incomingRequestCount}
            onOpenSwipeItem={onOpenSwipeItem}
            onCloseMenuItem={onCloseMenuItem}
            onResetTransientUi={onResetTransientUi}
            onListScrollStart={onListScrollStart}
            onSelectArchiveSection={onSelectArchiveSection}
          />
        ) : null}
      </div>
    </section>
  );
});

MessengerHomeMainSections.displayName = "MessengerHomeMainSections";
