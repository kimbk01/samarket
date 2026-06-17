"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { partitionMessengerFriendsByNew } from "@/lib/community-messenger/messenger-new-friend-window";
import { MessengerFriendRowQuickPopup } from "@/components/community-messenger/MessengerFriendRowQuickPopup";
import { MessengerFriendsMyProfileStrip } from "@/components/community-messenger/MessengerFriendsMyProfileStrip";
import { MessengerLineFriendRow } from "@/components/community-messenger/MessengerLineFriendRow";
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
}: Props) {
  const { t } = useI18n();
  const [quickMenuUserId, setQuickMenuUserId] = useState<string | null>(null);

  useLayoutEffect(() => {
    friendQuickMenuBlocksTabSwipeRef.current = quickMenuUserId != null;
    return () => {
      friendQuickMenuBlocksTabSwipeRef.current = false;
    };
  }, [friendQuickMenuBlocksTabSwipeRef, quickMenuUserId]);

  useEffect(() => {
    setQuickMenuUserId((prev) => (prev === null ? prev : null));
  }, [messengerOverlayGeneration]);

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

  const { newFriends, regularFriends } = useMemo(
    () => partitionMessengerFriendsByNew(sortedFriends, friendListEpochMs),
    [sortedFriends, friendListEpochMs]
  );

  const { favoriteFriends, normalFriends } = useMemo(() => {
    const favorite: CommunityMessengerProfileLite[] = [];
    const normal: CommunityMessengerProfileLite[] = [];
    for (const friend of regularFriends) {
      if (friend.isFavoriteFriend) favorite.push(friend);
      else normal.push(friend);
    }
    return { favoriteFriends: favorite, normalFriends: normal };
  }, [regularFriends]);

  const renderFriendSection = (
    title: string,
    rows: CommunityMessengerProfileLite[],
    accent?: string,
    opts?: { topDivider?: boolean }
  ) => {
    if (rows.length === 0) return null;
    const topDivider = opts?.topDivider !== false;
    return (
      <div
        className={`mt-2 overflow-hidden bg-[color:var(--messenger-bg)] ${topDivider ? "border-t border-[color:var(--messenger-divider)]" : ""}`}
      >
        <div className="flex items-center justify-between px-3 py-1.5">
          <h2 className="sam-text-body-secondary font-bold" style={{ color: accent ?? "var(--messenger-text)" }}>
            {title}
          </h2>
          <span className="sam-text-helper tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
            {rows.length}
          </span>
        </div>
        {rows.map((friend) => (
          <MessengerLineFriendRow
            key={friend.id}
            friend={friend}
            busyFavorite={busyId === `favorite:${friend.id}`}
            onToggleFavorite={onToggleFavorite}
            friendKind={getFriendDirectRoomKind(friend.id)}
            openedSwipeItemId={openedSwipeItemId}
            onOpenSwipeItem={onOpenSwipeItem}
            onOpenFriendQuickMenu={openFriendQuickMenu}
            onCloseFriendQuickMenu={closeFriendQuickMenu}
            onCloseMenuItem={onCloseMenuItem}
            onHideFriend={onFriendHide}
            onRemoveFriend={onFriendRemove}
            onBlockFriend={onFriendBlock}
          />
        ))}
      </div>
    );
  };

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
        <MessengerFriendsMyProfileStrip me={me} />

        {newFriends.length > 0
          ? renderFriendSection(t("cm_ui_new_friends_section"), newFriends, "var(--messenger-primary)", {
              topDivider: false,
            })
          : null}
        {favoriteFriends.length > 0
          ? renderFriendSection(t("cm_ui_favorite"), favoriteFriends, "var(--messenger-primary)", {
              topDivider: newFriends.length === 0,
            })
          : null}
        {normalFriends.length > 0
          ? renderFriendSection(t("nav_messenger_friend"), normalFriends, undefined, {
              topDivider: newFriends.length > 0 || favoriteFriends.length > 0,
            })
          : null}
        {sortedFriends.length === 0 ? (
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
            <div>
              <p className="sam-text-body font-medium">{t("cm_ui_hidden_blocked_notifications_off")}</p>
              <p className="mt-0.5 sam-text-xxs tabular-nums" style={{ color: "var(--messenger-text-secondary)" }}>
                {t("cm_ui_hidden_count", { count: friendStateModel.hidden.length })} · {t("cm_ui_block_count", { count: friendStateModel.blocked.length })} · {t("cm_ui_off_count", { count: friendStateModel.muted.length })}
              </p>
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
          onBlock={() => onFriendBlock(quickProfile.id)}
          isHidden={Boolean(quickProfile.isHiddenFriend)}
          isBlocked={Boolean(quickProfile.blocked)}
        />
      ) : null}
    </>
  );
}
