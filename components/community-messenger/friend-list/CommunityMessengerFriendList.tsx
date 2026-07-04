"use client";

import { presentFriendListRow } from "@/lib/community-messenger/friend-list/friend-relation-presenter";
import { sortFriendListRows } from "@/lib/community-messenger/friend-list/friend-list-sorter";
import { partitionMessengerFriendsByNew } from "@/lib/community-messenger/messenger-new-friend-window";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { CommunityMessengerFriendRow } from "@/components/community-messenger/friend-list/CommunityMessengerFriendRow";
import { CommunityMessengerFriendSection } from "@/components/community-messenger/friend-list/CommunityMessengerFriendSection";
import { MessengerFriendsMyProfileStrip } from "@/components/community-messenger/MessengerFriendsMyProfileStrip";

type Props = {
  me: CommunityMessengerProfileLite | null;
  sortedFriends: CommunityMessengerProfileLite[];
  friendListEpochMs: number;
  favoriteFriendIds: Set<string>;
  hiddenFriendIds: Set<string>;
  blockedFriendIds: Set<string>;
  mutedFriendIds: Set<string>;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onOpenFriendQuickMenu: (userId: string) => void;
};

export function CommunityMessengerFriendList({
  me,
  sortedFriends,
  friendListEpochMs,
  favoriteFriendIds,
  hiddenFriendIds,
  blockedFriendIds,
  mutedFriendIds,
  onOpenProfile,
  onOpenFriendQuickMenu,
}: Props) {
  const viewerId = me?.id ?? "";
  const { newFriends, regularFriends } = partitionMessengerFriendsByNew(sortedFriends, friendListEpochMs);
  const favorites = regularFriends.filter((f) => favoriteFriendIds.has(f.id) || f.isFavoriteFriend);
  const normals = regularFriends.filter((f) => !favoriteFriendIds.has(f.id) && !f.isFavoriteFriend);

  const toRow = (profile: CommunityMessengerProfileLite) =>
    presentFriendListRow({
      profile,
      viewerUserId: viewerId,
      isFavorite: favoriteFriendIds.has(profile.id) || profile.isFavoriteFriend,
      isHidden: hiddenFriendIds.has(profile.id),
      isMuted: mutedFriendIds.has(profile.id),
      blockedByMe: blockedFriendIds.has(profile.id),
      nowMs: friendListEpochMs,
    });

  const renderRows = (profiles: CommunityMessengerProfileLite[]) =>
    sortFriendListRows(profiles.map((p) => toRow(p))).map((row) => (
      <CommunityMessengerFriendRow
        key={row.profileId}
        row={row}
        onPress={() =>
          onOpenProfile(sortedFriends.find((f) => f.id === row.profileId) ?? { id: row.profileId, label: row.displayName, avatarUrl: null, following: false, blocked: false, isFriend: false, isFavoriteFriend: false })
        }
        onLongPress={() => onOpenFriendQuickMenu(row.profileId)}
      />
    ));

  return (
    <div className="overflow-y-auto">
      {me ? <MessengerFriendsMyProfileStrip me={me} /> : null}
      {favorites.length ? (
        <CommunityMessengerFriendSection titleKey="cm_friend_section_favorites">{renderRows(favorites)}</CommunityMessengerFriendSection>
      ) : null}
      {newFriends.length ? (
        <CommunityMessengerFriendSection titleKey="cm_friend_section_new">{renderRows(newFriends)}</CommunityMessengerFriendSection>
      ) : null}
      {normals.length ? (
        <CommunityMessengerFriendSection titleKey="cm_friend_section_friends">{renderRows(normals)}</CommunityMessengerFriendSection>
      ) : null}
    </div>
  );
}
