"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Step = "main" | "call";

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
  const pid = profile.id;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  /** Only close dimmer on a real pointer cycle on the dimmer (avoids synthetic `click` after touch). */
  const dimmerPointerIdRef = useRef<number | null>(null);
  /** Ignore dimmer close briefly after open (same touch can synthesize a follow-up on mobile). */
  const dimmerSuppressUntilRef = useRef(0);
  const [step, setStep] = useState<Step>("main");
  const [launching, setLaunching] = useState<null | "chat" | "voice" | "video">(null);

  useEffect(() => {
    if (!open) {
      setStep("main");
      setLaunching(null);
      return;
    }
    dimmerSuppressUntilRef.current = Date.now() + 320;
    setStep("main");
    setLaunching(null);
  }, [open, pid]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  if (!document.body) return null;

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

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[55] bg-black/50"
        data-messenger-friend-quick-popup="true"
        aria-hidden
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if (e.target !== e.currentTarget) return;
          dimmerPointerIdRef.current = e.pointerId;
        }}
        onPointerUp={(e) => {
          if (e.button !== 0) return;
          if (e.target !== e.currentTarget) return;
          if (dimmerPointerIdRef.current !== e.pointerId) return;
          dimmerPointerIdRef.current = null;
          if (Date.now() < dimmerSuppressUntilRef.current) return;
          onClose();
        }}
        onPointerCancel={() => {
          dimmerPointerIdRef.current = null;
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 z-[56] flex items-center justify-center px-4 py-6"
        data-messenger-friend-quick-popup="true"
        data-messenger-shell
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div
          ref={panelRef}
          data-messenger-friend-sheet="true"
          className="pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-[24px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[0_24px_70px_rgba(15,23,42,0.34)]"
        >
          {step === "main" ? (
            <>
              <div className="border-b border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] px-4 py-3">
                <p id={titleId} className="truncate text-[16px] font-semibold" style={{ color: "var(--messenger-text)" }}>
                  {profile.label}
                </p>
                <p className="mt-1 truncate text-[12px]" style={{ color: "var(--messenger-text-secondary)" }}>
                  {profile.bio?.trim() || profile.subtitle?.trim() || ""}
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <ActionTile
                    label={bChat ? "연결 중" : "1:1 채팅"}
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
                    label={bVoice ? "연결 중" : "음성"}
                    icon={<IconPhoneOutline className="h-5 w-5" />}
                    onClick={() => {
                      haptic(14);
                      setLaunching("voice");
                      window.setTimeout(() => onVoiceCall(), 220);
                      closeAfterPress(300);
                    }}
                    disabled={anyBusy}
                  />
                  <ActionTile
                    label={bVideo ? "연결 중" : "영상"}
                    icon={<IconVideoOutline className="h-5 w-5" />}
                    onClick={() => {
                      haptic(14);
                      setLaunching("video");
                      window.setTimeout(() => onVideoCall(), 220);
                      closeAfterPress(300);
                    }}
                    disabled={anyBusy}
                  />
                </div>
              </div>

              <div className="px-4 py-3">
                <div className="overflow-hidden rounded-[18px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)]">
                  <SheetRow
                    label="프로필 보기"
                    onClick={() => {
                      haptic(10);
                      onOpenProfile();
                      closeAfterPress();
                    }}
                  />
                  <SheetRow
                    label={favoriteActive ? "즐겨찾기 해제" : "즐겨찾기"}
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
                          ? "처리 중…"
                          : typeof directRoomMuted === "boolean"
                            ? directRoomMuted
                              ? "대화 알림 켜기"
                              : "대화 알림 끄기"
                            : "대화 알림"
                      }
                      sub={typeof directRoomMuted === "boolean" ? (directRoomMuted ? "현재 OFF" : "현재 ON") : undefined}
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
                    label={isHidden ? "숨김 해제" : "숨기기"}
                    onClick={() => {
                      haptic(12);
                      onHide();
                      closeAfterPress();
                    }}
                    danger
                  />
                  <SheetRow
                    label={isBlocked ? "차단 해제" : "차단"}
                    onClick={() => {
                      haptic(12);
                      onBlock();
                      closeAfterPress();
                    }}
                    danger
                  />
                  <SheetRow
                    label="친구 삭제"
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
                className="w-full border-t border-[color:var(--messenger-divider)] px-4 py-3 text-[14px] font-medium"
                style={{ color: "var(--messenger-text-secondary)" }}
              >
                닫기
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 border-b border-[color:var(--messenger-divider)] px-2 py-2">
                <button
                  type="button"
                  onClick={() => setStep("main")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[18px] active:bg-[color:var(--messenger-primary-soft)]"
                  style={{ color: "var(--messenger-text)" }}
                  aria-label="뒤로"
                >
                  ‹
                </button>
                <p className="flex-1 text-center text-[13px] font-semibold" style={{ color: "var(--messenger-text)" }}>
                  통화하기
                </p>
                <span className="w-8" />
              </div>
              <div className="px-4 py-4">
                <div className="overflow-hidden rounded-[18px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface-muted)]">
                  <SheetRow
                    label={bVoice ? "음성 통화 연결 중…" : "음성 통화"}
                    sub="음성"
                    icon={<IconPhoneOutline className="h-5 w-5" />}
                    onClick={() => {
                      haptic(14);
                      onVoiceCall();
                      closeAfterPress();
                    }}
                    disabled={anyBusy}
                  />
                  <SheetRow
                    label={bVideo ? "영상 통화 연결 중…" : "영상 통화"}
                    sub="영상"
                    icon={<IconVideoOutline className="h-5 w-5" />}
                    onClick={() => {
                      haptic(14);
                      onVideoCall();
                      closeAfterPress();
                    }}
                    disabled={anyBusy}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}

function ActionTile({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[16px] border border-transparent bg-[color:var(--messenger-primary-soft)] px-2 text-[12px] font-semibold disabled:opacity-50 active:bg-[color:var(--messenger-primary-soft-2)]"
      style={{ color: "var(--messenger-text)" }}
    >
      <span className="text-[color:var(--messenger-primary)]">{icon}</span>
      <span className="text-[12px]">{label}</span>
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
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        {sub ? <span className="mt-0.5 block text-[11px] text-[color:var(--messenger-text-secondary)]">{sub}</span> : null}
      </span>
    </button>
  );
}
