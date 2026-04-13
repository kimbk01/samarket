"use client";

import { MessengerChatsScreen, MessengerOpenChatScreen } from "@/components/community-messenger/MessengerChatsScreen";
import { MessengerArchiveScreen } from "@/components/community-messenger/MessengerArchiveScreen";
import { MessengerFriendsScreen } from "@/components/community-messenger/MessengerFriendsScreen";
import { MessengerPrimarySectionNav } from "@/components/community-messenger/MessengerPrimarySectionNav";
import {
  inboxKindToChatListChip,
  messengerChatListEmptyMessageForChip,
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

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  me: CommunityMessengerProfileLite | null;
  sortedFriends: CommunityMessengerProfileLite[];
  friendStateModel: MessengerFriendStateModel;
  busyId: string | null;
  onOpenFriendsPrivacySummary: () => void;
  onOpenFriendRowActions: (profile: CommunityMessengerProfileLite) => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onToggleFavoriteFriend: (userId: string) => void;
  onFriendSwipeHide: (userId: string) => void;
  onFriendSwipeRemove: (userId: string) => void;
  onFriendSwipeBlock: (userId: string) => void;
  primaryListItems: UnifiedRoomListItem[];
  favoriteFriendIds: Set<string>;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  onOpenRoomActions?: (item: UnifiedRoomListItem, listContext: MessengerChatListContext) => void;
  chatInboxFilter: MessengerChatInboxFilter;
  chatKindFilter: MessengerChatKindFilter;
  onChatListChipChange: (next: MessengerChatListChip) => void;
  openChatJoinedItems: UnifiedRoomListItem[];
  filteredDiscoverableGroups: CommunityMessengerDiscoverableGroupSummary[];
  onPreviewOpenGroup: (groupId: string) => void;
};

export function MessengerHomeMainSections({
  mainSection,
  onPrimarySectionChange,
  me,
  sortedFriends,
  friendStateModel,
  busyId,
  onOpenFriendsPrivacySummary,
  onOpenFriendRowActions,
  onOpenProfile,
  onToggleFavoriteFriend,
  onFriendSwipeHide,
  onFriendSwipeRemove,
  onFriendSwipeBlock,
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
}: Props) {
  const chatListChip = inboxKindToChatListChip(chatInboxFilter, chatKindFilter);

  return (
    <>
      <MessengerPrimarySectionNav value={mainSection} onChange={onPrimarySectionChange} />

      {mainSection === "friends" ? (
        <MessengerFriendsScreen
          me={me}
          sortedFriends={sortedFriends}
          friendStateModel={friendStateModel}
          busyId={busyId}
          onOpenPrivacySummary={onOpenFriendsPrivacySummary}
          onOpenFriendRowActions={onOpenFriendRowActions}
          onOpenProfile={onOpenProfile}
          onToggleFavorite={onToggleFavoriteFriend}
          onFriendHide={onFriendSwipeHide}
          onFriendRemove={onFriendSwipeRemove}
          onFriendBlock={onFriendSwipeBlock}
        />
      ) : null}

      {mainSection === "chats" ? (
        <MessengerChatsScreen
          items={primaryListItems}
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
        />
      ) : null}

      {mainSection === "open_chat" ? (
        <MessengerOpenChatScreen
          joinedItems={openChatJoinedItems}
          discoverableGroups={filteredDiscoverableGroups}
          favoriteFriendIds={favoriteFriendIds}
          busyId={busyId}
          onTogglePin={onTogglePin}
          onToggleMute={onToggleMute}
          onMarkRead={onMarkRead}
          onToggleArchive={onToggleArchive}
          onPreviewGroup={onPreviewOpenGroup}
          onOpenRoomActions={onOpenRoomActions}
        />
      ) : null}

      {mainSection === "archive" ? (
        <MessengerArchiveScreen
          items={primaryListItems}
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
        />
      ) : null}
    </>
  );
}
