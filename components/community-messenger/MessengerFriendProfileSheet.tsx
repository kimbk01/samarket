"use client";

import {
  MessengerFriendAddCtaLabelKeys,
  type MessengerFriendAddCta,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityMessengerFriendPresenceLine } from "@/components/community-messenger/friend-list/CommunityMessengerFriendPresenceLine";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { Ban, Bell, BellOff, Check, Eye, EyeOff, Flag, MessageCircle, Phone, Star, UserMinus, Users, Video, X } from "lucide-react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { hasCustomUserAvatar, resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import {
  DibayBottomSheet,
  DibayMenuList,
  DibayQuickActions,
  type DibayMenuItem,
  type DibayQuickAction,
} from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import {
  MessengerFriendRelationCta,
  type MessengerFriendCtaBusy,
} from "@/components/community-messenger/friend-cta/MessengerFriendRelationCta";

type Props = {
  profile: CommunityMessengerProfileLite;
  busyId: string | null;
  onClose: () => void;
  /** default: Home·친구목록. roomHeader: 1:1 방 안 — 「메시지 보내기」 CTA 생략 */
  context?: "default" | "roomHeader";
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onChat?: () => void;
  onToggleFavorite?: () => void;
  onToggleHidden?: () => void;
  onInviteToGroup?: () => void;
  onToggleMuteNotifications?: () => void;
  directRoomMuted?: boolean;
  notificationsBusy?: boolean;
  onRemoveFriend?: () => void;
  onBlock?: () => void;
  onReport?: () => void;
  friendAddCta?: MessengerFriendAddCta;
  onFriendAdd?: () => void;
  /** 보낸 요청 취소 (확인 팝업은 시트가 띄운다) */
  onFriendCancel?: () => void;
  onFriendAccept?: (requestId: string) => void;
  onFriendReject?: (requestId: string) => void;
};

/**
 * 친구 탭 — 탭한 사용자 프로필(시트). 라우팅 없음.
 * Telegram-style: 차단이 아니면 메시지·통화 가능. 친구 추가는 연락처 저장만.
 */
export function MessengerFriendProfileSheet({
  profile,
  busyId,
  onClose,
  context = "default",
  onVoiceCall,
  onVideoCall,
  onChat,
  onToggleFavorite,
  onToggleHidden,
  onInviteToGroup,
  onToggleMuteNotifications,
  directRoomMuted,
  notificationsBusy = false,
  onRemoveFriend,
  onBlock,
  onReport,
  friendAddCta,
  onFriendAdd,
  onFriendCancel,
  onFriendAccept,
  onFriendReject,
}: Props) {
  const { t } = useI18n();
  const pid = profile.id;
  const bVoice = busyId === `call:voice:${pid}`;
  const bVideo = busyId === `call:video:${pid}`;
  const bChat = busyId === `room:${pid}`;
  const bFav = busyId === `favorite:${pid}`;
  const bHidden = busyId === `hidden:${pid}`;
  const anyBusy = Boolean(busyId);
  const incomingRequestId = friendAddCta?.kind === "pending_incoming" ? friendAddCta.requestId : "";
  const friendCtaBusy: MessengerFriendCtaBusy =
    busyId === `friend-add:${pid}`
      ? "send"
      : busyId === `friend-cancel:${pid}`
        ? "cancel"
        : incomingRequestId && busyId === `request:${incomingRequestId}:accept`
          ? "accept"
          : incomingRequestId && busyId === `request:${incomingRequestId}:reject`
            ? "reject"
            : null;

  const avatarSrc = profile.avatarUrl ?? undefined;
  const statusLine = profile.subtitle?.trim() ?? "";
  /**
   * §16 (Owner 2026-10-25): 상대 상태(bio)·@아이디 — 진입 경로(대화방 머리글·친구 행·검색·통화 기록)마다
   * 받은 프로필에 빠져 있을 수 있어(방 스냅샷 labels-only 등) 비어 있으면 `users/resolve` 로 1회 채운다(읽기만).
   */
  const [resolvedPeer, setResolvedPeer] = useState<{ id: string; bio: string; atId: string } | null>(null);
  const needsResolve = !profile.bio?.trim() || !statusLine.startsWith("@");
  useEffect(() => {
    const pid = profile.id?.trim();
    if (!pid || !needsResolve) return;
    const controller = new AbortController();
    void fetch(`/api/community-messenger/users/resolve?targetUserId=${encodeURIComponent(pid)}`, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    })
      .then((res) => res.json().catch(() => null))
      .then((json: { ok?: boolean; profile?: { bio?: string | null; public_id?: string | null } } | null) => {
        if (!json?.ok || !json.profile) return;
        const atId = (json.profile.public_id ?? "").trim();
        setResolvedPeer({
          id: pid,
          bio: (json.profile.bio ?? "").trim(),
          atId: atId ? (atId.startsWith("@") ? atId : `@${atId}`) : "",
        });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [profile.id, needsResolve]);
  const resolvedForThis = resolvedPeer && resolvedPeer.id === profile.id?.trim() ? resolvedPeer : null;
  const atUsername = statusLine.startsWith("@") ? statusLine : resolvedForThis?.atId ?? "";
  const statusMessage = profile.bio?.trim() || resolvedForThis?.bio || "";

  const useFriendAddGate = Boolean(friendAddCta && onFriendAdd);
  const canMessage = !profile.blocked;
  const canCall = canMessage;
  const cta = friendAddCta;
  const showDirectChatAction = context === "default";
  const showFriendMenuActions = context === "default";

  /** 주 행동은 화면에 1개 — 친구 요청 버튼이 있으면 그것이 주 행동, 빠른 행동은 모두 보조 */
  const friendCtaShown = Boolean(useFriendAddGate && cta && cta.kind !== "friend");
  const quickActions: DibayQuickAction[] = [
    ...(showDirectChatAction
      ? [
          {
            key: "chat",
            icon: <MessageCircle strokeWidth={2.2} />,
            label: t("cm_friend_cta_message"),
            onClick: onChat,
            disabled: anyBusy || !canMessage,
            loading: bChat,
            primary: !friendCtaShown,
          },
        ]
      : []),
    {
      key: "voice",
      icon: <Phone strokeWidth={2.2} />,
      label: t("nav_voice_call_label"),
      onClick: onVoiceCall,
      disabled: anyBusy || !canCall,
      loading: bVoice,
      primary: !showDirectChatAction && !friendCtaShown,
    },
    {
      key: "video",
      icon: <Video strokeWidth={2.2} />,
      label: t("nav_video_call_label"),
      onClick: onVideoCall,
      disabled: anyBusy || !canCall,
      loading: bVideo,
    },
  ];

  const friendMenu: DibayMenuItem[] =
    showFriendMenuActions && profile.isFriend
      ? [
          ...(onToggleFavorite
            ? [
                {
                  key: "favorite",
                  icon: <Star />,
                  label: bFav ? t("common_processing") : profile.isFavoriteFriend ? t("cm_ui_unfavorite") : t("cm_ui_favorite"),
                  onClick: onToggleFavorite,
                  disabled: anyBusy,
                },
              ]
            : []),
          ...(onToggleHidden
            ? [
                {
                  key: "hidden",
                  icon: profile.isHiddenFriend ? <Eye /> : <EyeOff />,
                  label: bHidden ? t("common_processing") : profile.isHiddenFriend ? t("cm_ui_unhide") : t("common_hide"),
                  onClick: onToggleHidden,
                  disabled: anyBusy,
                },
              ]
            : []),
          ...(onToggleMuteNotifications
            ? [
                typeof directRoomMuted === "boolean"
                  ? {
                      key: "mute",
                      icon: directRoomMuted ? <Bell /> : <BellOff />,
                      label: notificationsBusy
                        ? t("common_processing")
                        : directRoomMuted
                          ? t("cm_ui_turn_on_conversation_notifications")
                          : t("cm_ui_turn_off_conversation_notifications"),
                      onClick: onToggleMuteNotifications,
                      disabled: anyBusy,
                    }
                  : {
                      key: "mute",
                      icon: <BellOff />,
                      label: t("cm_ui_turn_off_conversation_notifications"),
                      hint: t("cm_ui_conversation_notifications_after_chat_start"),
                      disabled: true,
                    },
              ]
            : []),
          ...(onInviteToGroup
            ? [{ key: "invite", icon: <Users />, label: t("cm_ui_invite_to_group"), onClick: onInviteToGroup, disabled: anyBusy }]
            : []),
        ]
      : [];
  const dangerMenu: DibayMenuItem[] = showFriendMenuActions
    ? [
        ...(profile.isFriend && onRemoveFriend
          ? [{ key: "remove", icon: <UserMinus />, label: t("cm_ui_remove_friend"), onClick: onRemoveFriend, disabled: anyBusy, danger: true }]
          : []),
        ...(onBlock
          ? [
              {
                key: "block",
                icon: <Ban />,
                label: profile.blocked ? t("cm_ui_unblock") : t("common_block"),
                onClick: onBlock,
                disabled: anyBusy,
                danger: true,
              },
            ]
          : []),
        ...(onReport ? [{ key: "report", icon: <Flag />, label: t("common_report"), onClick: onReport, disabled: anyBusy, danger: true }] : []),
      ]
    : [];

  /** S4 프로필 시트 (1단계 문서 §13-2): 머리 → 가로 빠른 행동(메시지·음성·영상) → 행동 메뉴(위험 행동은 마지막 묶음) */
  return (
    <DibayBottomSheet
      open
      onClose={onClose}
      anchor="above-bottom-nav"
      ariaLabel={profile.label}
      showHandle
    >
        <div className={`relative ${OverlayUi.profileHeader}`} data-cm-friend-profile-sheet="">
          <button
            type="button"
            className="dibay-overlay-icon-btn absolute -right-2 -top-2"
            aria-label={t("nav_close")}
            onClick={onClose}
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
          <span className="relative inline-flex h-[72px] w-[72px] shrink-0">
            <SamarketThumbnail
              src={resolveUserAvatarImageSrc(avatarSrc)}
              size={72}
              roundedClassName="rounded-full"
              fallbackSrc=""
              fallbackNode={<SamarketDefaultAvatarFace className="h-full w-full" />}
            />
            {hasCustomUserAvatar(avatarSrc) ? (
              <span
                className="absolute bottom-0 right-0 z-[1] flex h-6 w-6 items-center justify-center rounded-full border-2 border-[color:var(--overlay-surface)] bg-[color:var(--overlay-primary)]"
                aria-hidden
              >
                <Check className="h-4 w-4 text-white" strokeWidth={3} />
              </span>
            ) : null}
          </span>
          <h2 id="messenger-friend-sheet-title" className={`mt-2 ${OverlayUi.title} ${OverlayUi.titleSheet}`}>
            {profile.label}
          </h2>
          {atUsername ? <p className={`mt-0.5 tabular-nums ${OverlayUi.caption}`}>{atUsername}</p> : null}
          {statusLine && !statusLine.startsWith("@") ? (
            <p className={`mt-0.5 line-clamp-2 ${OverlayUi.bodySecondary}`}>{statusLine}</p>
          ) : null}
          {statusMessage ? (
            <div
              className="mx-auto mt-2.5 w-full max-w-[280px] rounded-ui-rect bg-[color:var(--overlay-secondary,#f4f3ee)] px-3 py-2 text-left"
              data-cm-friend-profile-status=""
            >
              <span className={`block ${OverlayUi.caption}`}>{t("cm_profile_status_label")}</span>
              <p className={`line-clamp-3 whitespace-pre-line break-words ${OverlayUi.bodySecondary}`} style={{ color: "var(--overlay-text-primary)" }}>
                {statusMessage}
              </p>
            </div>
          ) : null}
          {profile.id ? (
            <div className="mt-1.5 flex justify-center sam-text-helper" data-cm-friend-profile-presence="">
              <CommunityMessengerFriendPresenceLine peerUserId={profile.id} />
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
            {profile.isFriend ? <StatusChip label={t(MessengerFriendAddCtaLabelKeys.friend)} tone="brand" /> : null}
            {profile.isFavoriteFriend ? <StatusChip label={t("cm_ui_favorite")} /> : null}
            {profile.isHiddenFriend ? <StatusChip label={t("common_hide")} /> : null}
            {profile.blocked ? <StatusChip label={t(MessengerFriendAddCtaLabelKeys.blockedChip)} tone="danger" /> : null}
          </div>
        </div>

        {friendCtaShown && cta ? (
          <div className="mt-3">
            <MessengerFriendRelationCta
              cta={cta}
              layout="sheet"
              busy={friendCtaBusy}
              disabled={anyBusy && friendCtaBusy === null}
              peerLabel={profile.label}
              onSend={onFriendAdd}
              onCancel={onFriendCancel}
              onAccept={incomingRequestId && onFriendAccept ? () => onFriendAccept(incomingRequestId) : undefined}
              onReject={incomingRequestId && onFriendReject ? () => onFriendReject(incomingRequestId) : undefined}
            />
          </div>
        ) : null}

        <DibayQuickActions items={quickActions} />
        {!canMessage ? (
          <p className={`-mt-2 mb-2 text-center ${OverlayUi.caption}`}>{t("cm_ui_cannot_add_friend_or_chat_when_blocked")}</p>
        ) : null}

        <DibayMenuList groups={[friendMenu, dangerMenu]} />
    </DibayBottomSheet>
  );
}

function StatusChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "danger" | "brand" }) {
  return (
    <span
      className={`rounded-[length:var(--overlay-radius-sm)] border px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-semibold ${
        tone === "danger"
          ? "border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-danger)]"
          : tone === "brand"
            ? "border-transparent bg-[color:var(--sm-color-primary-soft)] text-[color:var(--overlay-primary)]"
            : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-secondary)]"
      }`}
    >
      {label}
    </span>
  );
}
