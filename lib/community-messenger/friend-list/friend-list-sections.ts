/**
 * P-6: 친구 목록 분류·정렬 — 순수 함수. 컴포넌트는 입력이 바뀔 때만(useMemo) 호출한다.
 */
import { presentFriendListRow, type FriendListRowViewModel } from "@/lib/community-messenger/friend-list/friend-relation-presenter";
import { sortFriendListRows } from "@/lib/community-messenger/friend-list/friend-list-sorter";
import { partitionMessengerFriendsByNew } from "@/lib/community-messenger/messenger-new-friend-window";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

export type FriendListSectionsInput = {
  viewerUserId: string;
  sortedFriends: CommunityMessengerProfileLite[];
  friendListEpochMs: number;
  favoriteFriendIds: ReadonlySet<string>;
  hiddenFriendIds: ReadonlySet<string>;
  blockedFriendIds: ReadonlySet<string>;
  mutedFriendIds: ReadonlySet<string>;
};

export type FriendListSections = {
  favorites: FriendListRowViewModel[];
  newFriends: FriendListRowViewModel[];
  normals: FriendListRowViewModel[];
};

export function buildFriendListSections(input: FriendListSectionsInput): FriendListSections {
  const { newFriends, regularFriends } = partitionMessengerFriendsByNew(input.sortedFriends, input.friendListEpochMs);
  const isFavorite = (p: CommunityMessengerProfileLite) => input.favoriteFriendIds.has(p.id) || Boolean(p.isFavoriteFriend);
  const toRows = (profiles: CommunityMessengerProfileLite[]) =>
    sortFriendListRows(
      profiles.map((profile) =>
        presentFriendListRow({
          profile,
          viewerUserId: input.viewerUserId,
          isFavorite: isFavorite(profile),
          isHidden: input.hiddenFriendIds.has(profile.id),
          isMuted: input.mutedFriendIds.has(profile.id),
          blockedByMe: input.blockedFriendIds.has(profile.id),
          nowMs: input.friendListEpochMs,
        })
      )
    );
  return {
    favorites: toRows(regularFriends.filter(isFavorite)),
    newFriends: toRows(newFriends),
    normals: toRows(regularFriends.filter((f) => !isFavorite(f))),
  };
}

/** 행 memo 비교 — presenter 는 매번 새 객체를 만들므로 표시 필드로 비교한다. */
export function friendListRowViewModelsEqual(a: FriendListRowViewModel, b: FriendListRowViewModel): boolean {
  if (a === b) return true;
  return (
    a.profileId === b.profileId &&
    a.displayName === b.displayName &&
    a.publicId === b.publicId &&
    a.avatarUrl === b.avatarUrl &&
    a.status === b.status &&
    a.statusBadgeKey === b.statusBadgeKey &&
    a.statusBadgeColor === b.statusBadgeColor &&
    a.isFavorite === b.isFavorite &&
    a.isNewFriend === b.isNewFriend &&
    a.subtitle === b.subtitle &&
    a.canAddFriend === b.canAddFriend &&
    a.readdBlockedUntil === b.readdBlockedUntil
  );
}
