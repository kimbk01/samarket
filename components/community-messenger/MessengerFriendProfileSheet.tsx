"use client";

import {
  MessengerFriendAddCtaLabelKeys,
  type MessengerFriendAddCta,
} from "@/lib/community-messenger/messenger-friend-add-cta";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";
import { Check } from "lucide-react";
import { CallKindBottomSheetActions } from "@/components/community-messenger/call-ui/CallKindBottomSheetActions";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SamarketDefaultAvatarFace } from "@/components/profile/SamarketDefaultAvatarFace";
import { hasCustomUserAvatar, resolveUserAvatarImageSrc } from "@/lib/profile/user-avatar-display";
import { DibayBottomSheet, DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";

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
}: Props) {
  const { t } = useI18n();
  const pid = profile.id;
  const bVoice = busyId === `call:voice:${pid}`;
  const bVideo = busyId === `call:video:${pid}`;
  const bChat = busyId === `room:${pid}`;
  const bFav = busyId === `favorite:${pid}`;
  const bHidden = busyId === `hidden:${pid}`;
  const anyBusy = Boolean(busyId);
  const bFriendAdd = busyId === `friend-add:${pid}`;

  const avatarSrc = profile.avatarUrl ?? undefined;
  const statusLine = profile.subtitle?.trim() ?? "";
  const atUsername = statusLine.startsWith("@") ? statusLine : "";

  const useFriendAddGate = Boolean(friendAddCta && onFriendAdd);
  const canMessage = !profile.blocked;
  const canCall = canMessage;
  const cta = friendAddCta;
  const showDirectChatAction = context === "default";
  const showFriendMenuActions = context === "default";

  return (
    <DibayBottomSheet
      open
      onClose={onClose}
      anchor="above-bottom-nav"
      ariaLabel={profile.label}
      showHandle
    >
        <div className={OverlayUi.profileHeader}>
          <span className="relative inline-flex h-16 w-16 shrink-0">
            <SamarketThumbnail
              src={resolveUserAvatarImageSrc(avatarSrc)}
              size={64}
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
          {statusLine && !atUsername ? (
            <p className={`mt-0.5 line-clamp-2 ${OverlayUi.bodySecondary}`}>{statusLine}</p>
          ) : null}
          {atUsername ? <p className={`mt-1 font-mono tabular-nums ${OverlayUi.caption}`}>{atUsername}</p> : null}
          <div className="mt-2 flex flex-wrap items-center justify-center gap-1">
            {profile.isFriend ? <StatusChip label={t(MessengerFriendAddCtaLabelKeys.friend)} /> : null}
            {profile.isFavoriteFriend ? <StatusChip label={t("cm_ui_favorite")} /> : null}
            {profile.isHiddenFriend ? <StatusChip label={t("common_hide")} /> : null}
            {profile.blocked ? <StatusChip label={t(MessengerFriendAddCtaLabelKeys.blockedChip)} tone="danger" /> : null}
          </div>
        </div>

        {useFriendAddGate && cta ? (
          <div className="mt-3">
            {renderFriendAddBlock({
              cta,
              bFriendAdd,
              busyId,
              onFriendAdd,
              t,
            })}
          </div>
        ) : null}

        {canCall ? (
          <CallKindBottomSheetActions
            onVoiceCall={onVoiceCall}
            onVideoCall={onVideoCall}
            voiceBusy={bVoice}
            videoBusy={bVideo}
            disabled={anyBusy}
          />
        ) : null}

        {showDirectChatAction ? (
          <>
            <div className={`mt-3 ${!canMessage ? "opacity-40" : ""}`}>
              <DibayOverlayButton
                roleTone="secondary"
                onClick={onChat}
                disabled={anyBusy || !canMessage || !onChat}
                loading={bChat}
                className="!flex-none w-full"
              >
                {t("cm_friend_cta_message")}
              </DibayOverlayButton>
            </div>
            {!canMessage ? (
              <p className={`mt-2 text-center ${OverlayUi.caption}`}>{t("cm_ui_cannot_add_friend_or_chat_when_blocked")}</p>
            ) : null}
          </>
        ) : null}

        {showFriendMenuActions ? (
        <div className="mt-3 divide-y divide-[color:var(--overlay-border)] border-t border-[color:var(--overlay-border)]">
          {onToggleFavorite && profile.isFriend ? (
            <ActionRow
              label={bFav ? t("common_processing") : profile.isFavoriteFriend ? t("cm_ui_unfavorite") : t("cm_ui_favorite")}
              onClick={onToggleFavorite}
              disabled={anyBusy}
            />
          ) : null}
          {onToggleHidden && profile.isFriend ? (
            <ActionRow
              label={bHidden ? t("common_processing") : profile.isHiddenFriend ? t("cm_ui_unhide") : t("common_hide")}
              onClick={onToggleHidden}
              disabled={anyBusy}
            />
          ) : null}
          {onToggleMuteNotifications && profile.isFriend ? (
            <ActionRow
              label={
                notificationsBusy
                  ? t("common_processing")
                  : typeof directRoomMuted === "boolean"
                    ? directRoomMuted
                      ? t("cm_ui_turn_on_conversation_notifications")
                      : t("cm_ui_turn_off_conversation_notifications")
                    : t("cm_ui_conversation_notifications_after_chat_start")
              }
              onClick={onToggleMuteNotifications}
              disabled={anyBusy || typeof directRoomMuted !== "boolean"}
            />
          ) : null}
          {onInviteToGroup && profile.isFriend ? <ActionRow label={t("cm_ui_invite_to_group")} onClick={onInviteToGroup} disabled={anyBusy} /> : null}
          {profile.isFriend && onRemoveFriend ? <ActionRow label={t("cm_ui_remove_friend")} onClick={onRemoveFriend} disabled={anyBusy} danger /> : null}
          {onBlock ? <ActionRow label={profile.blocked ? t("cm_ui_unblock") : t("common_block")} onClick={onBlock} disabled={anyBusy} danger /> : null}
          {onReport ? <ActionRow label={t("common_report")} onClick={onReport} disabled={anyBusy} danger /> : null}
        </div>
        ) : null}

        <DibayOverlayButton roleTone="text" onClick={onClose} className="mt-2">
          {t("nav_close")}
        </DibayOverlayButton>
    </DibayBottomSheet>
  );
}

function renderFriendAddBlock(args: {
  cta: MessengerFriendAddCta;
  bFriendAdd: boolean;
  busyId: string | null;
  onFriendAdd?: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const { cta, bFriendAdd, busyId, onFriendAdd, t } = args;

  if (cta.kind === "friend") return null;

  if (cta.kind === "blocked") {
    return (
      <div className="rounded-ui-rect border border-ui-border bg-ui-page px-3 py-3 text-center">
        <p className="sam-text-body font-semibold text-ui-muted">{t("cm_friend_cta_unavailable")}</p>
        <p className="mt-1 sam-text-helper leading-snug text-ui-muted">{t("cm_ui_cannot_add_friend_or_chat_when_blocked")}</p>
      </div>
    );
  }

  if (cta.kind === "add_friend") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={onFriendAdd}
          disabled={Boolean(busyId)}
          className="w-full rounded-ui-rect bg-ui-fg py-3 sam-text-body font-semibold text-ui-surface disabled:opacity-50"
        >
          {bFriendAdd ? t("common_processing") : t("cm_friend_cta_add")}
        </button>
      </div>
    );
  }

  return null;
}

function StatusChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "danger" }) {
  return (
    <span
      className={`rounded-[length:var(--overlay-radius-sm)] border px-1.5 py-0.5 text-[length:var(--overlay-caption-size)] font-semibold ${
        tone === "danger"
          ? "border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-danger)]"
          : "border-[color:var(--overlay-border)] bg-[color:var(--overlay-secondary)] text-[color:var(--overlay-text-secondary)]"
      }`}
    >
      {label}
    </span>
  );
}

function ActionRow({
  label,
  onClick,
  disabled,
  danger = false,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !onClick}
      className={`flex min-h-[48px] w-full items-center justify-between px-0.5 text-left text-[length:var(--overlay-body-1-size)] font-medium transition-transform duration-100 active:scale-[0.98] active:bg-[color:var(--overlay-secondary)] disabled:opacity-50 ${
        danger ? "text-[color:var(--overlay-danger)]" : "text-[color:var(--overlay-text-primary)]"
      }`}
    >
      <span>{label}</span>
      {!onClick ? <span className={OverlayUi.caption}>...</span> : null}
    </button>
  );
}
