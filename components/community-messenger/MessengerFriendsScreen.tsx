"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessengerResetTransientUiFn } from "@/lib/community-messenger/messenger-reset-transient-ui";
import { MessengerFriendRowQuickPopup } from "@/components/community-messenger/MessengerFriendRowQuickPopup";
import { MessengerBlockPeerConfirmModal } from "@/components/community-messenger/MessengerBlockPeerConfirmModal";
import { MessengerFriendsPrivacySummaryIcons } from "@/components/community-messenger/MessengerFriendsPrivacySheet";
import { CommunityMessengerFriendList } from "@/components/community-messenger/friend-list/CommunityMessengerFriendList";
import { MessengerSearchHighlightText } from "@/components/community-messenger/MessengerSearchHighlightText";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import {
  COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH,
  type CommunityMessengerUserSearchResult,
} from "@/lib/community-messenger/user-public-id-search";
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
  const [blockConfirmUserId, setBlockConfirmUserId] = useState<string | null>(null);
  const [inlineSearchKeyword, setInlineSearchKeyword] = useState("");
  const [inlineSearchResults, setInlineSearchResults] = useState<CommunityMessengerUserSearchResult[]>([]);
  const [inlineSearchBusy, setInlineSearchBusy] = useState(false);
  const [inlineSearchAttempted, setInlineSearchAttempted] = useState(false);
  const inlineSearchSeqRef = useRef(0);

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

  useEffect(() => {
    const keyword = inlineSearchKeyword.trim();
    if (!keyword || keyword.length < COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH) {
      inlineSearchSeqRef.current += 1;
      setInlineSearchResults([]);
      setInlineSearchBusy(false);
      if (!keyword) setInlineSearchAttempted(false);
      return;
    }
    const seq = ++inlineSearchSeqRef.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setInlineSearchBusy(true);
        try {
          const res = await fetch(`/api/community-messenger/users?q=${encodeURIComponent(keyword)}`, {
            cache: "no-store",
          });
          if (seq !== inlineSearchSeqRef.current) return;
          const json = (await res.json()) as { ok?: boolean; users?: CommunityMessengerUserSearchResult[] };
          setInlineSearchResults(res.ok && json.ok ? json.users ?? [] : []);
          setInlineSearchAttempted(true);
        } finally {
          if (seq === inlineSearchSeqRef.current) setInlineSearchBusy(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [inlineSearchKeyword]);

  const showInlineResults =
    inlineSearchKeyword.trim().length >= COMMUNITY_MESSENGER_USER_SEARCH_MIN_LENGTH;

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
        <div className="px-0 pb-1">
          <input
            value={inlineSearchKeyword}
            onChange={(e) => setInlineSearchKeyword(e.target.value.slice(0, 20))}
            maxLength={20}
            placeholder={t("cm_ui_at_id_example")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full rounded-ui-rect border border-transparent bg-[color:var(--messenger-primary-soft)] px-2 py-2 text-[14px] outline-none focus:border-[color:var(--messenger-primary)] focus:bg-[color:var(--messenger-surface)] focus:ring-1 focus:ring-[color:var(--messenger-primary)]"
            style={{ color: "var(--messenger-text)" }}
          />
        </div>
        {showInlineResults ? (
          <div className="divide-y divide-[color:var(--messenger-divider)] overflow-hidden rounded-ui-rect border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]">
            {inlineSearchBusy ? (
              <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                {t("common_loading")}
              </p>
            ) : inlineSearchResults.length === 0 ? (
              <p className="px-3 py-4 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                {!inlineSearchAttempted ? t("cm_ui_enter_keyword_then_search") : t("cm_social_no_matching_users")}
              </p>
            ) : (
              inlineSearchResults.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  disabled={!user.canMessage || Boolean(busyId)}
                  onClick={() => {
                    if (!user.canMessage) return;
                    onFriendChat(user.id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left active:bg-[color:var(--messenger-surface-muted)] disabled:opacity-40"
                >
                  <SamarketThumbnail
                    src={user.avatarUrl?.trim() || null}
                    size={40}
                    roundedClassName="rounded-full"
                    className="bg-[color:var(--messenger-surface-muted)]"
                    fallbackSrc=""
                    fallbackNode={
                      <span className="sam-text-body-secondary font-semibold" style={{ color: "var(--messenger-text-secondary)" }}>
                        {user.displayName.trim().slice(0, 1) || "?"}
                      </span>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate sam-text-body font-medium" style={{ color: "var(--messenger-text)" }}>
                      {user.displayName}
                    </p>
                    {user.publicId ? (
                      <p className="truncate sam-text-xxs" style={{ color: "var(--messenger-text-secondary)" }}>
                        <MessengerSearchHighlightText text={user.publicId} ranges={user.highlightRanges} prefix="@" />
                      </p>
                    ) : null}
                  </div>
                </button>
              ))
            )}
          </div>
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
