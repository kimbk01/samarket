"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { MessengerFriendRowQuickPopup } from "@/components/community-messenger/MessengerFriendRowQuickPopup";
import { MessengerBlockPeerConfirmModal } from "@/components/community-messenger/MessengerBlockPeerConfirmModal";
import { MessengerReceivedFriendRequestsCard } from "@/components/community-messenger/friend-cta/MessengerReceivedFriendRequestsCard";
import { CommunityMessengerFriendList } from "@/components/community-messenger/friend-list/CommunityMessengerFriendList";
import type {
  CommunityMessengerFriendRequest,
  CommunityMessengerProfileLite,
} from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

type Props = {
  me: CommunityMessengerProfileLite | null;
  sortedFriends: CommunityMessengerProfileLite[];
  /** 신규 친구 24시간 구간 partition 기준 시각 — hook `friendSortEpochMs` 와 동기화 */
  friendListEpochMs: number;
  friendStateModel: MessengerFriendStateModel;
  friendRequests?: CommunityMessengerFriendRequest[];
  /** 받은 요청 카드「확인」 → 친구 요청 시트(상위 화면 소유) */
  onOpenFriendRequests: (tab?: "received" | "sent") => void;
  busyId: string | null;
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
  isScrolling?: boolean;
};

export function MessengerFriendsScreen({
  me,
  sortedFriends,
  friendListEpochMs,
  friendStateModel,
  friendRequests = [],
  onOpenFriendRequests,
  busyId,
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
  isScrolling = false,
}: Props) {
  const { t } = useI18n();
  const [quickMenuUserId, setQuickMenuUserId] = useState<string | null>(null);
  const [blockConfirmUserId, setBlockConfirmUserId] = useState<string | null>(null);
  const blockInFlightUserIdRef = useRef<string | null>(null);
  const blockBusyForConfirm = Boolean(blockConfirmUserId && busyId === `block:${blockConfirmUserId}`);
  useEffect(() => {
    const inFlight = blockInFlightUserIdRef.current;
    if (!inFlight || blockBusyForConfirm) return;
    if (busyId === `block:${inFlight}`) return;
    blockInFlightUserIdRef.current = null;
    setBlockConfirmUserId((prev) => (prev === inFlight ? null : prev));
  }, [blockBusyForConfirm, busyId]);
  const incomingPending = useMemo(
    () => friendRequests.filter((r) => r.status === "pending" && r.direction === "incoming"),
    [friendRequests]
  );
  useLayoutEffect(() => {
    friendQuickMenuBlocksTabSwipeRef.current = quickMenuUserId != null;
    return () => {
      friendQuickMenuBlocksTabSwipeRef.current = false;
    };
  }, [friendQuickMenuBlocksTabSwipeRef, quickMenuUserId]);

  useEffect(() => {
    setQuickMenuUserId((prev) => (prev === null ? prev : null));
  }, [messengerOverlayGeneration]);

  useEffect(() => {
    if (!isScrolling) return;
    setQuickMenuUserId((prev) => (prev === null ? prev : null));
  }, [isScrolling]);

  const openFriendQuickMenu = useCallback(
    (userId: string) => {
      onOpenSwipeItem(null);
      queueMicrotask(() => setQuickMenuUserId((prev) => (prev === userId ? prev : userId)));
    },
    [onOpenSwipeItem]
  );

  const closeFriendQuickMenu = useCallback(() => {
    setQuickMenuUserId((prev) => (prev === null ? prev : null));
  }, []);

  const quickProfile =
    quickMenuUserId == null ? null : sortedFriends.find((f) => f.id === quickMenuUserId) ?? null;

  const favoriteFriendIds = useMemo(
    () => new Set(sortedFriends.filter((f) => f.isFavoriteFriend).map((f) => f.id)),
    [sortedFriends]
  );
  const hiddenFriendIds = useMemo(
    () => new Set(friendStateModel.hidden.map((entry) => entry.profile.id)),
    [friendStateModel.hidden]
  );
  const blockedFriendIds = useMemo(
    () => new Set(friendStateModel.blocked.map((entry) => entry.profile.id)),
    [friendStateModel.blocked]
  );
  const mutedFriendIds = useMemo(
    () => new Set(friendStateModel.muted.map((entry) => entry.profile.id)),
    [friendStateModel.muted]
  );

  const hasVisibleFriends = sortedFriends.length > 0;

  return (
    <>
      <section
        className="space-y-2 pt-0"
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
        {incomingPending.length > 0 ? (
          <MessengerReceivedFriendRequestsCard requests={incomingPending} onOpen={() => onOpenFriendRequests("received")} />
        ) : null}
        <CommunityMessengerFriendList
          me={me}
          sortedFriends={sortedFriends}
          friendListEpochMs={friendListEpochMs}
          favoriteFriendIds={favoriteFriendIds}
          hiddenFriendIds={hiddenFriendIds}
          blockedFriendIds={blockedFriendIds}
          mutedFriendIds={mutedFriendIds}
          onOpenProfile={onOpenProfile}
          onOpenChat={onFriendChat}
          onOpenFriendQuickMenu={openFriendQuickMenu}
        />

        {!hasVisibleFriends ? (
          <div
            className="border-b border-t border-[color:var(--messenger-divider)] px-3 py-6 text-center sam-text-body-secondary"
            style={{ color: "var(--messenger-text-secondary)" }}
          >
            {t("cm_ui_no_friends_yet")}
          </div>
        ) : null}

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
          onBlock={() => {
            closeFriendQuickMenu();
            setBlockConfirmUserId(quickProfile.id);
          }}
          isHidden={Boolean(quickProfile.isHiddenFriend)}
          isBlocked={Boolean(quickProfile.blocked)}
        />
      ) : null}
      <MessengerBlockPeerConfirmModal
        open={Boolean(blockConfirmUserId)}
        busy={Boolean(blockConfirmUserId && busyId === `block:${blockConfirmUserId}`)}
        onCancel={() => setBlockConfirmUserId(null)}
        onConfirm={() => {
          if (!blockConfirmUserId) return;
          /** 처리 중에는 팝업을 유지(busy 표시) — busyId 가 풀리면 아래 effect 가 닫는다. */
          blockInFlightUserIdRef.current = blockConfirmUserId;
          onFriendBlock(blockConfirmUserId);
        }}
      />
    </>
  );
}
