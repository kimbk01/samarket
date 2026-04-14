"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { MessengerFriendRowQuickPopup } from "@/components/community-messenger/MessengerFriendRowQuickPopup";
import { MessengerFriendsMyProfileStrip } from "@/components/community-messenger/MessengerFriendsMyProfileStrip";
import { MessengerLineFriendRow } from "@/components/community-messenger/MessengerLineFriendRow";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

type Props = {
  me: CommunityMessengerProfileLite | null;
  sortedFriends: CommunityMessengerProfileLite[];
  friendStateModel: MessengerFriendStateModel;
  busyId: string | null;
  onOpenPrivacySummary: () => void;
  onOpenProfile: (profile: CommunityMessengerProfileLite) => void;
  onToggleFavorite: (userId: string) => void;
  onFriendHide: (userId: string) => void;
  onFriendRemove: (userId: string) => void;
  onFriendBlock: (userId: string) => void;
  onFriendChat: (userId: string) => void;
  onFriendVoiceCall: (userId: string) => void;
  onFriendVideoCall: (userId: string) => void;
  getFriendDirectRoomMuted: (userId: string) => boolean | undefined;
  getFriendDirectRoomKind: (userId: string) => "trade" | "delivery" | null;
  friendNotificationsBusy: (userId: string) => boolean;
  onFriendToggleRoomMute: (userId: string) => void;
  friendHasDirectRoom: (userId: string) => boolean;
  pendingCallTarget: string | null;
  openedSwipeItemId: string | null;
  onOpenSwipeItem: (id: string | null) => void;
  onCloseMenuItem: (id?: string) => void;
  onResetTransientUi: MessengerResetTransientUiFn;
  messengerOverlayGeneration: number;
  friendQuickMenuBlocksTabSwipeRef: MutableRefObject<boolean>;
};

export function MessengerFriendsScreen({
  me,
  sortedFriends,
  friendStateModel,
  busyId,
  onOpenPrivacySummary,
  onOpenProfile,
  onToggleFavorite,
  onFriendHide,
  onFriendRemove,
  onFriendBlock,
  onFriendChat,
  onFriendVoiceCall,
  onFriendVideoCall,
  getFriendDirectRoomMuted,
  getFriendDirectRoomKind,
  friendNotificationsBusy,
  onFriendToggleRoomMute,
  friendHasDirectRoom,
  pendingCallTarget,
  openedSwipeItemId,
  onOpenSwipeItem,
  onCloseMenuItem,
  onResetTransientUi,
  messengerOverlayGeneration,
  friendQuickMenuBlocksTabSwipeRef,
}: Props) {
  const [quickMenuUserId, setQuickMenuUserId] = useState<string | null>(null);

  useLayoutEffect(() => {
    friendQuickMenuBlocksTabSwipeRef.current = quickMenuUserId != null;
    return () => {
      friendQuickMenuBlocksTabSwipeRef.current = false;
    };
  }, [friendQuickMenuBlocksTabSwipeRef, quickMenuUserId]);

  useEffect(() => {
    setQuickMenuUserId(null);
  }, [messengerOverlayGeneration]);

  const openFriendQuickMenu = useCallback(
    (userId: string) => {
      onOpenSwipeItem(null);
      queueMicrotask(() => setQuickMenuUserId(userId));
    },
    [onOpenSwipeItem]
  );

  const closeFriendQuickMenu = useCallback(() => {
    setQuickMenuUserId(null);
  }, []);

  const quickProfile =
    quickMenuUserId == null ? null : sortedFriends.find((f) => f.id === quickMenuUserId) ?? null;

  const favoriteFriends = sortedFriends.filter((friend) => friend.isFavoriteFriend);
  const normalFriends = sortedFriends.filter((friend) => !friend.isFavoriteFriend);

  const renderFriendSection = (title: string, rows: CommunityMessengerProfileLite[], accent?: string) => {
    if (rows.length === 0) return null;
    return (
      <div className="overflow-hidden rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]">
        <div className="flex items-center justify-between border-b border-[color:var(--messenger-divider)] px-3 py-2">
          <h2
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: accent ?? "var(--messenger-text-secondary)" }}
          >
            {title}
          </h2>
          <span className="text-[11px] tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
            {rows.length}
          </span>
        </div>
        {rows.map((friend) => (
          <MessengerLineFriendRow
            key={friend.id}
            friend={friend}
            busyId={busyId}
            busyFavorite={busyId === `favorite:${friend.id}`}
            onRowPress={() => onOpenProfile(friend)}
            onToggleFavorite={() => onToggleFavorite(friend.id)}
            onFriendChat={() => onFriendChat(friend.id)}
            onFriendVoiceCall={() => onFriendVoiceCall(friend.id)}
            onFriendVideoCall={() => onFriendVideoCall(friend.id)}
            showMuteRow={friend.isFriend && friendHasDirectRoom(friend.id)}
            directRoomMuted={getFriendDirectRoomMuted(friend.id)}
            friendKind={getFriendDirectRoomKind(friend.id)}
            notificationsBusy={friendNotificationsBusy(friend.id)}
            onToggleDirectMute={() => onFriendToggleRoomMute(friend.id)}
            pendingCallTarget={pendingCallTarget}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onOpenFriendQuickMenu={openFriendQuickMenu}
            onCloseFriendQuickMenu={closeFriendQuickMenu}
            onCloseMenuItem={onCloseMenuItem}
            onHideFriend={() => onFriendHide(friend.id)}
            onRemoveFriend={() => onFriendRemove(friend.id)}
            onBlockFriend={() => onFriendBlock(friend.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <section
        className="space-y-3 pt-1"
        onPointerDownCapture={(e) => {
          if (quickMenuUserId) return;
          const target = e.target as HTMLElement | null;
          if (!target) return;
          if (target.closest("[data-messenger-friend-row='true']")) return;
          if (target.closest("[data-messenger-friend-sheet='true']")) return;
          if (target.closest("[data-messenger-friend-quick-popup='true']")) return;
          onResetTransientUi();
        }}
      >
        <MessengerFriendsMyProfileStrip me={me} />

        {favoriteFriends.length > 0 ? renderFriendSection("즐겨찾기", favoriteFriends, "var(--messenger-primary)") : null}
        {normalFriends.length > 0 ? renderFriendSection("친구", normalFriends) : null}
        {sortedFriends.length === 0 ? (
          <div
            className="rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-5 text-center text-[12px] shadow-[var(--messenger-shadow-soft)]"
            style={{ color: "var(--messenger-text-secondary)" }}
          >
            아직 친구가 없습니다.
          </div>
        ) : null}

        <div>
          <button
            type="button"
            onClick={onOpenPrivacySummary}
            className="flex w-full items-center justify-between rounded-[var(--messenger-radius-md)] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-3 py-2.5 text-left shadow-[var(--messenger-shadow-soft)] active:bg-[color:var(--messenger-primary-soft)]"
            style={{ color: "var(--messenger-text)" }}
          >
            <div>
              <p className="text-[14px] font-medium">숨김 · 차단 · 알림 끔</p>
              <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
                숨김 {friendStateModel.hidden.length} · 차단 {friendStateModel.blocked.length} · 끔 {friendStateModel.muted.length}
              </p>
            </div>
            <span className="text-[12px]" style={{ color: "var(--messenger-text-secondary)" }} aria-hidden>
              ›
            </span>
          </button>
        </div>
      </section>
      {quickProfile ? (
        <MessengerFriendRowQuickPopup
          profile={quickProfile}
          open
          anchorRect={null}
          onClose={closeFriendQuickMenu}
          busyId={busyId}
          onOpenProfile={() => onOpenProfile(quickProfile)}
          favoriteActive={quickProfile.isFavoriteFriend}
          onToggleFavorite={() => onToggleFavorite(quickProfile.id)}
          onChat={() => onFriendChat(quickProfile.id)}
          onVoiceCall={() => onFriendVoiceCall(quickProfile.id)}
          onVideoCall={() => onFriendVideoCall(quickProfile.id)}
          pendingVoice={pendingCallTarget === `voice:${quickProfile.id}`}
          pendingVideo={pendingCallTarget === `video:${quickProfile.id}`}
          showMuteRow={quickProfile.isFriend && friendHasDirectRoom(quickProfile.id)}
          directRoomMuted={getFriendDirectRoomMuted(quickProfile.id)}
          notificationsBusy={friendNotificationsBusy(quickProfile.id)}
          onToggleMute={() => onFriendToggleRoomMute(quickProfile.id)}
          onHide={() => onFriendHide(quickProfile.id)}
          onRemove={() => onFriendRemove(quickProfile.id)}
          onBlock={() => onFriendBlock(quickProfile.id)}
          isHidden={Boolean(quickProfile.isHiddenFriend)}
          isBlocked={Boolean(quickProfile.blocked)}
        />
      ) : null}
    </>
  );
}
