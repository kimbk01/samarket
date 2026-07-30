"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { MessengerFriendRowQuickPopup } from "@/components/community-messenger/MessengerFriendRowQuickPopup";
import { MessengerBlockPeerConfirmModal } from "@/components/community-messenger/MessengerBlockPeerConfirmModal";
import { MessengerFriendsPrivacySummaryIcons } from "@/components/community-messenger/MessengerFriendsPrivacySheet";
import { CommunityMessengerFriendList } from "@/components/community-messenger/friend-list/CommunityMessengerFriendList";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import type { MessengerFriendStateModel } from "@/lib/community-messenger/messenger-friend-model";

type Props = {
  me: CommunityMessengerProfileLite | null;
  sortedFriends: CommunityMessengerProfileLite[];
  /** 신규 친구 24시간 구간 partition 기준 시각 — hook `friendSortEpochMs` 와 동기화 */
  friendListEpochMs: number;
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
  isScrolling?: boolean;
};

export function MessengerFriendsScreen({
  me,
  sortedFriends,
  friendListEpochMs,
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
  isScrolling = false,
}: Props) {
  const { t } = useI18n();
  const [quickMenuUserId, setQuickMenuUserId] = useState<string | null>(null);
  const [blockConfirmUserId, setBlockConfirmUserId] = useState<string | null>(null);
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

        <div>
          <button
            type="button"
            onClick={onOpenPrivacySummary}
            className="flex w-full items-center justify-between border-b border-t border-[color:var(--messenger-divider)] bg-[color:var(--messenger-bg)] px-3 py-2.5 text-left active:bg-[color:var(--messenger-surface-muted)]"
            style={{ color: "var(--messenger-text)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="sam-text-body font-medium">{t("cm_ui_hidden_blocked_notifications_off")}</p>
              <div className="mt-0.5">
                <MessengerFriendsPrivacySummaryIcons
                  hiddenCount={friendStateModel.hidden.length}
                  blockedCount={friendStateModel.blocked.length}
                  mutedCount={friendStateModel.muted.length}
                />
              </div>
            </div>
            <span className="sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }} aria-hidden>
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
          onFriendBlock(blockConfirmUserId);
          setBlockConfirmUserId(null);
        }}
      />
    </>
  );
}
