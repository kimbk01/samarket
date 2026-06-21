"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { MessengerHomeBottomSheetShell } from "@/components/community-messenger/MessengerSheetUi";
import { CallRipple } from "@/components/messenger/call/CallRipple";
import { triggerCallHaptic } from "@/components/messenger/call/CallHapticController";
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

function IconChatOutline({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.5C4 5.12 5.12 4 6.5 4h11C18.88 4 20 5.12 20 6.5v6c0 1.38-1.12 2.5-2.5 2.5H9.2l-3.7 2.47V15H6.5A2.5 2.5 0 0 1 4 12.5v-6Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPhoneOutline({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.86.33 1.7.62 2.5a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.8.29 1.64.5 2.5.62A2 2 0 0 1 22 16.92z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconVideoOutline({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7.5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M16 10l4-2.5v9L16 14v-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

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
    if (!open) {
      setLaunching((prev) => (prev === null ? prev : null));
      return;
    }
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

  const muteIcon =
    typeof directRoomMuted === "boolean" ?
      directRoomMuted ?
        <Bell className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      : <BellOff className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
    : null;

  return (
    <MessengerHomeBottomSheetShell
      onClose={onClose}
      closeAriaLabel={t("nav_close")}
      dialogAriaLabel={profile.label}
      anchor="center"
      panelClassName="w-full max-w-[420px] overflow-hidden rounded-[24px] shadow-[0_24px_70px_rgba(15,23,42,0.34)]"
    >
      <div data-messenger-friend-quick-popup="true" data-messenger-friend-sheet="true" className="flex max-h-[min(80dvh,560px)] flex-col overflow-hidden">
        <>
            <div className="border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3">
              <p id={titleId} className="truncate sam-text-body-lg font-semibold" style={{ color: "var(--messenger-text)" }}>
                {profile.label}
              </p>
              <p className="mt-1 truncate sam-text-helper" style={{ color: "var(--messenger-text-secondary)" }}>
                {profile.bio?.trim() || profile.subtitle?.trim() || ""}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <ActionTile
                  label={bChat ? t("cm_ui_connecting") : t("cm_ui_direct_chat")}
                  icon={<IconChatOutline className="h-5 w-5" />}
                  onClick={() => {
                    haptic(12);
                    setLaunching("chat");
                    window.setTimeout(() => onChat(), 220);
                    closeAfterPress(300);
                  }}
                  disabled={anyBusy}
                />
                <ActionTile
                  label={bVoice ? t("cm_ui_connecting") : t("nav_voice_call_label")}
                  icon={<IconPhoneOutline className="h-5 w-5" />}
                  onClick={() => {
                    setLaunching("voice");
                    window.setTimeout(() => onVoiceCall(), 220);
                    closeAfterPress(300);
                  }}
                  disabled={anyBusy}
                  callFeedback
                />
                <ActionTile
                  label={bVideo ? t("cm_ui_connecting") : t("nav_video_call_label")}
                  icon={<IconVideoOutline className="h-5 w-5" />}
                  onClick={() => {
                    setLaunching("video");
                    window.setTimeout(() => onVideoCall(), 220);
                    closeAfterPress(300);
                  }}
                  disabled={anyBusy}
                  callFeedback
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="overflow-hidden rounded-[18px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]">
                <SheetRow
                  label={t("cm_ui_open_profile")}
                  onClick={() => {
                    haptic(10);
                    onOpenProfile();
                    closeAfterPress();
                  }}
                />
                <SheetRow
                  label={favoriteActive ? t("cm_ui_unfavorite") : t("cm_ui_favorite")}
                  onClick={() => {
                    haptic(10);
                    onToggleFavorite();
                    closeAfterPress();
                  }}
                  disabled={busyId != null}
                />
                {showMuteRow && onToggleMute ? (
                  <SheetRow
                    label={
                      notificationsBusy
                        ? t("common_processing")
                        : typeof directRoomMuted === "boolean"
                          ? directRoomMuted
                            ? t("cm_ui_turn_on_conversation_notifications")
                            : t("cm_ui_turn_off_conversation_notifications")
                          : t("cm_ui_conversation_notifications")
                    }
                    sub={
                      typeof directRoomMuted === "boolean"
                        ? directRoomMuted
                          ? t("cm_ui_current_off")
                          : t("cm_ui_current_on")
                        : undefined
                    }
                    icon={muteIcon}
                    onClick={() => {
                      haptic(10);
                      onToggleMute();
                      closeAfterPress();
                    }}
                    disabled={anyBusy || typeof directRoomMuted !== "boolean" || notificationsBusy}
                  />
                ) : null}
              </div>

              <div className="mt-3 overflow-hidden rounded-[18px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]">
                <SheetRow
                  label={isHidden ? t("cm_ui_unhide") : t("common_hide")}
                  onClick={() => {
                    haptic(12);
                    onHide();
                    closeAfterPress();
                  }}
                  danger
                />
                <SheetRow
                  label={isBlocked ? t("cm_ui_unblock") : t("common_block")}
                  onClick={() => {
                    haptic(12);
                    onBlock();
                    closeAfterPress();
                  }}
                  danger
                />
                <SheetRow
                  label={t("cm_ui_remove_friend")}
                  onClick={() => {
                    haptic(14);
                    onRemove();
                    closeAfterPress();
                  }}
                  danger
                />
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full shrink-0 border-t border-[color:var(--messenger-divider)] px-4 py-3 sam-text-body font-medium"
              style={{ color: "var(--messenger-text-secondary)" }}
            >
              {t("nav_close")}
            </button>
        </>
      </div>
    </MessengerHomeBottomSheetShell>
  );
}

function ActionTile({
  label,
  icon,
  onClick,
  disabled,
  callFeedback = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  callFeedback?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={() => {
        if (callFeedback) triggerCallHaptic("selection");
      }}
      disabled={disabled}
      className="relative flex min-h-[52px] flex-col items-center justify-center gap-1 overflow-hidden rounded-[16px] border border-transparent bg-[color:var(--messenger-primary-soft)] px-2 sam-text-helper font-semibold transition active:scale-[0.96] disabled:opacity-50 active:bg-[color:var(--messenger-primary-soft-2)]"
      style={{ color: "var(--messenger-text)" }}
    >
      <CallRipple />
      <span className="text-[color:var(--messenger-primary)]">{icon}</span>
      <span className="sam-text-helper">{label}</span>
    </button>
  );
}

function SheetRow({
  label,
  sub,
  icon,
  onClick,
  disabled,
  danger = false,
}: {
  label: string;
  sub?: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[56px] w-full items-center gap-3 border-b border-[color:var(--messenger-divider)] px-4 py-3 text-left last:border-b-0 disabled:opacity-50 ${
        danger ? "active:bg-rose-50" : "active:bg-[color:var(--messenger-primary-soft)]"
      }`}
      style={{ color: danger ? "var(--ui-danger)" : "var(--messenger-text)" }}
    >
      {icon ? <span className="shrink-0 text-[color:var(--messenger-primary)]">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block sam-text-body font-medium">{label}</span>
        {sub ? <span className="mt-0.5 block sam-text-xxs text-[color:var(--messenger-text-secondary)]">{sub}</span> : null}
      </span>
    </button>
  );
}
