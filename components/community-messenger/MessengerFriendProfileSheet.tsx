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

type Props = {
  profile: CommunityMessengerProfileLite;
  busyId: string | null;
  onClose: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  onChat: () => void;
  onToggleFavorite: () => void;
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

  return (
    <div className="fixed inset-0 z-[45] flex flex-col justify-end bg-black/25" role="dialog" aria-modal="true" aria-labelledby="messenger-friend-sheet-title">
      <button type="button" className="min-h-0 flex-1 cursor-default" aria-label={t("nav_close")} onClick={onClose} />
      <div
        className="max-h-[82vh] w-full overflow-y-auto rounded-t-[24px] border border-ui-border bg-ui-surface px-3 pb-[max(0.75rem,var(--safe-bottom))] pt-2 dark:border-white/10 dark:bg-[#121212]"
      >
        <div className="flex flex-col items-center border-b border-ui-border pb-3 text-center">
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
                className="absolute bottom-0 right-0 z-[1] flex h-6 w-6 items-center justify-center rounded-full border-2 border-ui-surface bg-sam-primary"
                aria-hidden
              >
                <Check className="h-4 w-4 text-sam-on-primary" strokeWidth={3} />
              </span>
            ) : null}
          </span>
          <h2 id="messenger-friend-sheet-title" className="mt-2 sam-text-body-lg font-semibold text-ui-fg">
            {profile.label}
          </h2>
          {statusLine && !atUsername ? (
            <p className="mt-0.5 line-clamp-2 sam-text-helper text-ui-muted">{statusLine}</p>
          ) : null}
          {atUsername ? <p className="mt-1 font-mono sam-text-xxs text-ui-muted tabular-nums">{atUsername}</p> : null}
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

        <div className={`mt-3 ${!canMessage ? "opacity-40" : ""}`}>
          <button
            type="button"
            onClick={onChat}
            disabled={anyBusy || !canMessage}
            className="flex h-11 w-full items-center justify-center rounded-[18px] border border-ui-border bg-ui-page sam-text-body-secondary font-semibold text-ui-fg active:bg-ui-hover disabled:opacity-50"
          >
            {t("cm_friend_cta_message")}
            {bChat ? (
              <span className="ml-2 sam-text-xxs font-medium text-ui-muted">{t("cm_ui_opening")}</span>
            ) : null}
          </button>
        </div>
        {!canMessage ? (
          <p className="mt-2 text-center sam-text-xxs text-ui-muted">{t("cm_ui_cannot_add_friend_or_chat_when_blocked")}</p>
        ) : null}

        <div className="mt-3 divide-y divide-ui-border border-t border-ui-border">
          {profile.isFriend ? (
            <ActionRow
              label={bFav ? t("common_processing") : profile.isFavoriteFriend ? t("cm_ui_unfavorite") : t("cm_ui_favorite")}
              onClick={onToggleFavorite}
              disabled={anyBusy}
            />
          ) : null}
          {profile.isFriend ? (
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

        <button type="button" onClick={onClose} className="mt-2 w-full py-2.5 sam-text-body-secondary font-medium text-ui-muted active:bg-ui-hover">
          {t("nav_close")}
        </button>
      </div>
    </div>
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
      className={`rounded-ui-rect border px-1.5 py-0.5 sam-text-xxs font-semibold ${
        tone === "danger" ? "border-ui-border bg-ui-page text-[var(--ui-danger)]" : "border-ui-border bg-ui-page text-ui-muted"
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
      className={`flex min-h-[var(--ui-tap-min,44px)] w-full items-center justify-between px-0.5 text-left sam-text-body font-medium active:bg-ui-hover disabled:opacity-50 ${
        danger ? "text-[var(--ui-danger)]" : "text-ui-fg"
      }`}
    >
      <span>{label}</span>
      {!onClick ? <span className="sam-text-xxs text-ui-muted">...</span> : null}
    </button>
  );
}
