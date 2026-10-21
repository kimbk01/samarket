"use client";

import { memo, useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { buildFriendListSections } from "@/lib/community-messenger/friend-list/friend-list-sections";
import type { FriendListRowViewModel } from "@/lib/community-messenger/friend-list/friend-relation-presenter";
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
};

/**
 * P-6: 분류·정렬은 입력이 바뀔 때만 계산하고, 행은 memo + id 기반 안정 콜백.
 * 가상화는 하지 않는다 — 섹션 헤더가 `sticky` 이고 허브 스크롤러가 `[data-messenger-hub-list-scroll]`
 * 내부 컨테이너라, 문서 스크롤 기준인 채팅 목록 가상화를 그대로 재사용할 수 없다.
 */
export const CommunityMessengerFriendList = memo(function CommunityMessengerFriendList({
  me,
  sortedFriends,
  friendListEpochMs,
  favoriteFriendIds,
  hiddenFriendIds,
  blockedFriendIds,
  mutedFriendIds,
  onOpenChat,
  onOpenFriendQuickMenu,
}: Props) {
  const viewerId = me?.id ?? "";
  const { favorites, newFriends, normals } = useMemo(
    () =>
      buildFriendListSections({
        viewerUserId: viewerId,
        sortedFriends,
        friendListEpochMs,
        favoriteFriendIds,
        hiddenFriendIds,
        blockedFriendIds,
        mutedFriendIds,
      }),
    [viewerId, sortedFriends, friendListEpochMs, favoriteFriendIds, hiddenFriendIds, blockedFriendIds, mutedFriendIds]
  );

  /** 부모 콜백이 렌더마다 바뀌어도 행 memo 가 유지되도록 최신 값만 ref 로 참조 */
  const handlersRef = useRef({ onOpenChat, onOpenFriendQuickMenu });
  useLayoutEffect(() => {
    handlersRef.current = { onOpenChat, onOpenFriendQuickMenu };
  }, [onOpenChat, onOpenFriendQuickMenu]);
  const onRowPress = useCallback((profileId: string) => handlersRef.current.onOpenChat(profileId), []);
  const onRowLongPress = useCallback(
    (profileId: string) => handlersRef.current.onOpenFriendQuickMenu(profileId),
    []
  );

  const renderRows = (rows: FriendListRowViewModel[]) =>
    rows.map((row) => (
      <CommunityMessengerFriendRow key={row.profileId} row={row} onPress={onRowPress} onLongPress={onRowLongPress} />
    ));

  return (
    <div>
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
});

CommunityMessengerFriendList.displayName = "CommunityMessengerFriendList";
