"use client";

import { MessengerChatsScreen, MessengerOpenChatScreen } from "@/components/community-messenger/MessengerChatsScreen";
import { MessengerArchiveScreen } from "@/components/community-messenger/MessengerArchiveScreen";
import { MessengerFriendsScreen } from "@/components/community-messenger/MessengerFriendsScreen";
import { MessengerPrimarySectionNav } from "@/components/community-messenger/MessengerPrimarySectionNav";
import type { MessengerMainSection } from "@/lib/community-messenger/messenger-ia";
import type {
  CommunityMessengerDiscoverableGroupSummary,
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
  CommunityMessengerRoomSummary,
} from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";
import type { MessengerChatSubFilter } from "@/lib/community-messenger/messenger-ia";
import type { UnifiedRoomListItem } from "@/lib/community-messenger/use-community-messenger-home-state";

type Props = {
  mainSection: MessengerMainSection;
  onPrimarySectionChange: (next: MessengerMainSection) => void;
  sectionNavBadges: Partial<Record<MessengerMainSection, number>>;
  me: CommunityMessengerProfileLite | null;
  favoriteFriends: CommunityMessengerProfileLite[];
  sortedFriends: CommunityMessengerProfileLite[];
  friendStateModel: MessengerFriendStateModel;
  requests: CommunityMessengerFriendRequest[];
  busyId: string | null;
  friendsHiddenOpen: boolean;
  onToggleFriendsHiddenOpen: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onStartDirectRoom: (userId: string) => void;
  onStartDirectCall: (userId: string, kind: "voice" | "video") => void;
  onToggleFavoriteFriend: (userId: string) => void;
  onToggleHiddenFriend: (userId: string) => void;
  onDeleteFriend: (userId: string) => void;
  onToggleBlock: (userId: string) => void;
  onRespondRequest: (requestId: string, action: "accept" | "reject" | "cancel") => void;
  onOpenFriendInviteTools: () => void;
  primaryListItems: UnifiedRoomListItem[];
  favoriteFriendIds: Set<string>;
  onTogglePin: (room: CommunityMessengerRoomSummary) => void;
  onToggleMute: (room: CommunityMessengerRoomSummary) => void;
  onMarkRead: (room: CommunityMessengerRoomSummary) => void;
  onToggleArchive: (room: CommunityMessengerRoomSummary) => void;
  chatSubFilter: MessengerChatSubFilter;
  onChatSubFilterChange: (next: MessengerChatSubFilter) => void;
  totalUnreadCount: number;
  openChatJoinedItems: UnifiedRoomListItem[];
  filteredDiscoverableGroups: CommunityMessengerDiscoverableGroupSummary[];
  onPreviewOpenGroup: (groupId: string) => void;
};

export function MessengerHomeMainSections({
  mainSection,
  onPrimarySectionChange,
  sectionNavBadges,
  me,
  favoriteFriends,
  sortedFriends,
  friendStateModel,
  requests,
  busyId,
  friendsHiddenOpen,
  onToggleFriendsHiddenOpen,
  onOpenProfile,
  onStartDirectRoom,
  onStartDirectCall,
  onToggleFavoriteFriend,
  onToggleHiddenFriend,
  onDeleteFriend,
  onToggleBlock,
  onRespondRequest,
  onOpenFriendInviteTools,
  primaryListItems,
  favoriteFriendIds,
  onTogglePin,
  onToggleMute,
  onMarkRead,
  onToggleArchive,
  chatSubFilter,
  onChatSubFilterChange,
  totalUnreadCount,
  openChatJoinedItems,
  filteredDiscoverableGroups,
  onPreviewOpenGroup,
}: Props) {
  return (
    <>
      <MessengerPrimarySectionNav value={mainSection} onChange={onPrimarySectionChange} badge={sectionNavBadges} />

      {mainSection === "friends" ? (
        <MessengerFriendsScreen
          me={me}
          favoriteFriends={favoriteFriends}
          sortedFriends={sortedFriends}
          friendStateModel={friendStateModel}
          requests={requests}
          busyId={busyId}
          friendsHiddenOpen={friendsHiddenOpen}
          onToggleHiddenOpen={onToggleFriendsHiddenOpen}
          onOpenProfile={onOpenProfile}
          onStartChat={onStartDirectRoom}
          onStartCall={onStartDirectCall}
          onToggleFavorite={onToggleFavoriteFriend}
          onToggleHidden={onToggleHiddenFriend}
          onDeleteFriend={onDeleteFriend}
          onToggleBlock={onToggleBlock}
          onRequestAction={onRespondRequest}
          onOpenInviteTools={onOpenFriendInviteTools}
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
          chatSubFilter={chatSubFilter}
          onChatSubFilterChange={onChatSubFilterChange}
          totalUnreadCount={totalUnreadCount}
          emptyMessage="조건에 맞는 대화가 없습니다."
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
          chatSubFilter={chatSubFilter}
          onChatSubFilterChange={onChatSubFilterChange}
          totalUnreadCount={totalUnreadCount}
        />
      ) : null}
    </>
  );
}
