"use client";

import { presentFriendListRow } from "@/lib/community-messenger/friend-list/friend-relation-presenter";
import { sortFriendListRows } from "@/lib/community-messenger/friend-list/friend-list-sorter";
import type { ReactNode } from "react";
import { selectMessengerHomeNewFriends } from "@/lib/community-messenger/messenger-new-friend-window";
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
  onOpenChat: (userId: string) => void;
  onOpenFriendQuickMenu: (userId: string) => void;
  /** 내 프로필 줄 바로 아래 (받은 친구 요청 묶음) */
  afterMyProfile?: ReactNode;
  /** 친구이면서 내 연락처에 있는 회원 id + 표시 문구 (연락처 동기화 정책 #5) */
  contactFriendIds?: ReadonlySet<string>;
  contactTagLabel?: string;
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
  onOpenChat,
  onOpenFriendQuickMenu,
  afterMyProfile = null,
  contactFriendIds,
  contactTagLabel,
}: Props) {
  const viewerId = me?.id ?? "";
  /**
   * 채팅 시안 4판 「2. 친구 탭」: 「새 친구」 = 최근 7일 안에 친구가 된 사람(최근 순) — 이 사람들도 아래 즐겨찾기·「친구」 목록에 그대로 남는다.
   * 즐겨찾기 묶음·「친구」(즐겨찾기 아닌 친구) 나눔은 예전과 같다.
   */
  const newFriends = selectMessengerHomeNewFriends(sortedFriends, friendListEpochMs);
  const favorites = sortedFriends.filter((f) => favoriteFriendIds.has(f.id) || f.isFavoriteFriend);
  const normals = sortedFriends.filter((f) => !favoriteFriendIds.has(f.id) && !f.isFavoriteFriend);

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

  const renderRow = (row: ReturnType<typeof toRow>) => (
    <CommunityMessengerFriendRow
      key={row.profileId}
      row={row}
      contactTagLabel={contactFriendIds?.has(row.profileId) ? contactTagLabel ?? null : null}
      onPress={() => onOpenChat(row.profileId)}
      onLongPress={() => onOpenFriendQuickMenu(row.profileId)}
    />
  );
  const renderRows = (profiles: CommunityMessengerProfileLite[]) =>
    sortFriendListRows(profiles.map((p) => toRow(p))).map(renderRow);

  return (
    <div>
      {me ? <MessengerFriendsMyProfileStrip me={me} /> : null}
      {afterMyProfile}
      {newFriends.length ? (
        <CommunityMessengerFriendSection
          titleKey="cm_friend_section_new"
          count={newFriends.length}
          rightKey="cm_friend_section_new_window"
          sectionId="new"
        >
          {/* 최근 친구가 된 순서 그대로 (정렬하지 않음) */}
          {newFriends.map((p) => renderRow(toRow(p)))}
        </CommunityMessengerFriendSection>
      ) : null}
      {favorites.length ? (
        <CommunityMessengerFriendSection titleKey="cm_friend_section_favorites" count={favorites.length} sectionId="favorites">
          {renderRows(favorites)}
        </CommunityMessengerFriendSection>
      ) : null}
      {normals.length ? (
        <CommunityMessengerFriendSection titleKey="cm_friend_section_friends" count={normals.length} sectionId="friends">
          {renderRows(normals)}
        </CommunityMessengerFriendSection>
      ) : null}
    </div>
  );
}
