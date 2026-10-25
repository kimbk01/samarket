"use client";

import { useEffect, useId, useState } from "react";
import { Ban, Bell, BellOff, Eye, EyeOff, MessageCircle, Phone, Star, UserMinus, UserRound, Video } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayMenuList, DibayQuickActions, type DibayMenuItem } from "@/components/ui/dibay-overlay";
import { MessengerHomeBottomSheetShell, MessengerSheetHeaderBar } from "@/components/community-messenger/MessengerSheetUi";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Props = {
  profile: CommunityMessengerProfileLite;
  open: boolean;
  anchorRect: DOMRect | null;
  onClose: () => void;
  busyId: string | null;
  onOpenProfile: () => void;
  favoriteActive: boolean;
  onToggleFavorite: () => void;
  onChat: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  pendingVoice: boolean;
  pendingVideo: boolean;
  showMuteRow: boolean;
  directRoomMuted: boolean | undefined;
  notificationsBusy: boolean;
  onToggleMute?: () => void;
  onHide: () => void;
  onRemove: () => void;
  onBlock: () => void;
  isHidden: boolean;
  isBlocked: boolean;
};

export function MessengerFriendRowQuickPopup({
  profile,
  open,
  anchorRect: _anchorRect,
  onClose,
  busyId,
  onOpenProfile,
  favoriteActive,
  onToggleFavorite,
  onChat,
  onVoiceCall,
  onVideoCall,
  pendingVoice,
  pendingVideo,
  showMuteRow,
  directRoomMuted,
  notificationsBusy,
  onToggleMute,
  onHide,
  onRemove,
  onBlock,
  isHidden,
  isBlocked,
}: Props) {
  const { t } = useI18n();
  const pid = profile.id;
  const titleId = useId();
  const [launching, setLaunching] = useState<null | "chat" | "voice" | "video">(null);

  useEffect(() => {
    setLaunching((prev) => (prev === null ? prev : null));
  }, [open, pid]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const bChat = busyId === `room:${pid}`;
  const bVoice = pendingVoice || busyId === `call:voice:${pid}`;
  const bVideo = pendingVideo || busyId === `call:video:${pid}`;
  const anyBusy = Boolean(busyId) || launching != null;

  const haptic = (ms = 10) => {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) (navigator as Navigator).vibrate(ms);
    } catch {
      // ignore
    }
  };

  const closeAfterPress = (ms = 240) => {
    window.setTimeout(() => onClose(), ms);
  };

  const run = (fn: () => void, ms = 10) => () => {
    haptic(ms);
    fn();
    closeAfterPress();
  };
  const launch = (kind: "chat" | "voice" | "video", fn: () => void) => () => {
    haptic(kind === "chat" ? 12 : 14);
    setLaunching(kind);
    window.setTimeout(() => fn(), 220);
    closeAfterPress(300);
  };

  const menuMain: DibayMenuItem[] = [
    { key: "profile", icon: <UserRound />, label: t("cm_ui_open_profile"), onClick: run(onOpenProfile) },
    {
      key: "favorite",
      icon: <Star />,
      label: favoriteActive ? t("cm_ui_unfavorite") : t("cm_ui_favorite"),
      onClick: run(onToggleFavorite),
      disabled: busyId != null,
    },
    ...(showMuteRow && onToggleMute
      ? [
          {
            key: "mute",
            icon: directRoomMuted ? <Bell /> : <BellOff />,
            label: notificationsBusy
              ? t("common_processing")
              : typeof directRoomMuted === "boolean"
                ? directRoomMuted
                  ? t("cm_ui_turn_on_conversation_notifications")
                  : t("cm_ui_turn_off_conversation_notifications")
                : t("cm_ui_conversation_notifications"),
            hint:
              typeof directRoomMuted === "boolean"
                ? directRoomMuted
                  ? t("cm_ui_current_off")
                  : t("cm_ui_current_on")
                : t("cm_ui_conversation_notifications_after_chat_start"),
            onClick: run(onToggleMute),
            disabled: anyBusy || typeof directRoomMuted !== "boolean" || notificationsBusy,
          },
        ]
      : []),
    {
      key: "hide",
      icon: isHidden ? <Eye /> : <EyeOff />,
      label: isHidden ? t("cm_ui_unhide") : t("common_hide"),
      onClick: run(onHide, 12),
    },
  ];
  const menuDanger: DibayMenuItem[] = [
    { key: "remove", icon: <UserMinus />, label: t("cm_ui_remove_friend"), onClick: run(onRemove, 14), danger: true },
    {
      key: "block",
      icon: <Ban />,
      label: isBlocked ? t("cm_ui_unblock") : t("common_block"),
      onClick: run(onBlock, 12),
      danger: true,
    },
  ];

  /** 친구 행 빠른 메뉴 — S1 머리 + S4 빠른 행동 + S3 메뉴(1단계 문서 §13-2, 중앙 팝업 → 하단 시트) */
  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={profile.label}
      panelClassName="flex max-h-[min(82dvh,600px)] flex-col overflow-hidden"
    >
      <div data-messenger-friend-quick-popup="true" data-messenger-friend-sheet="true" className="flex min-h-0 flex-col overflow-hidden">
        <MessengerSheetHeaderBar title={<span id={titleId}>{profile.label}</span>} onClose={onClose} closeLabel={t("nav_close")} />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,var(--safe-bottom))]">
          {profile.bio?.trim() || profile.subtitle?.trim() ? (
            <p className="pt-2 text-center sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
              {profile.bio?.trim() || profile.subtitle?.trim()}
            </p>
          ) : null}
          <DibayQuickActions
            items={[
              {
                key: "chat",
                icon: <MessageCircle strokeWidth={2.2} />,
                label: bChat ? t("cm_ui_connecting") : t("cm_ui_direct_chat"),
                onClick: launch("chat", onChat),
                disabled: anyBusy,
                loading: launching === "chat",
                primary: true,
              },
              {
                key: "voice",
                icon: <Phone strokeWidth={2.2} />,
                label: bVoice ? t("cm_ui_connecting") : t("nav_voice_call_label"),
                onClick: launch("voice", onVoiceCall),
                disabled: anyBusy,
                loading: launching === "voice",
              },
              {
                key: "video",
                icon: <Video strokeWidth={2.2} />,
                label: bVideo ? t("cm_ui_connecting") : t("nav_video_call_label"),
                onClick: launch("video", onVideoCall),
                disabled: anyBusy,
                loading: launching === "video",
              },
            ]}
          />
          <DibayMenuList groups={[menuMain, menuDanger]} />
        </div>
      </div>
    </MessengerHomeBottomSheetShell>
  );
}
