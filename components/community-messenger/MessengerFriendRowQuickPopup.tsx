"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CommunityMessengerProfileLite } from "@/lib/community-messenger/types";

type Step = "main" | "call";

type Props = {
  profile: CommunityMessengerProfileLite;
  open: boolean;
  anchorRect: DOMRect | null;
  onClose: () => void;
  busyId: string | null;
  onChat: () => void;
  onVoiceCall: () => void;
  onVideoCall: () => void;
  /** 친구이며 1:1 방이 있을 때만 표시 */
  showMuteRow: boolean;
  directRoomMuted: boolean | undefined;
  notificationsBusy: boolean;
  onToggleMute?: () => void;
};

const POPUP_W = 280;

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

/**
 * 친구 행 ⋮ — 전체 화면 시트 대신 앵커 근처 고정 팝업 (채팅·통화 + 대화 알림)
 */
export function MessengerFriendRowQuickPopup({
  profile,
  open,
  anchorRect,
  onClose,
  busyId,
  onChat,
  onVoiceCall,
  onVideoCall,
  showMuteRow,
  directRoomMuted,
  notificationsBusy,
  onToggleMute,
}: Props) {
  const pid = profile.id;
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("main");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setStep("main");
      return;
    }
    setStep("main");
  }, [open, pid]);

  const layout = useCallback(() => {
    if (!open || !anchorRect) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 400;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const margin = 8;
    let left = anchorRect.left + anchorRect.width / 2 - POPUP_W / 2;
    left = Math.max(margin, Math.min(left, vw - POPUP_W - margin));
    const estH = step === "main" ? (showMuteRow ? 220 : 180) : 260;
    let top = anchorRect.bottom + 8;
    if (top + estH > vh - margin) {
      top = Math.max(margin, anchorRect.top - estH - 8);
    }
    setPos({ top, left });
  }, [open, anchorRect, step, showMuteRow]);

  useLayoutEffect(() => {
    layout();
  }, [layout]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, layout]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(t)) onClose();
    };
    document.addEventListener("mousedown", onDoc, true);
    return () => document.removeEventListener("mousedown", onDoc, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined" || !pos) return null;

  const bChat = busyId === `room:${pid}`;
  const bVoice = busyId === `call:voice:${pid}`;
  const bVideo = busyId === `call:video:${pid}`;
  const anyBusy = Boolean(busyId);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[55] bg-black/20" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed z-[56] max-w-[calc(100vw-16px)] rounded-[14px] border border-[color:var(--messenger-divider)] bg-[color:var(--messenger-surface)] shadow-[var(--messenger-shadow-soft)]"
        style={{ width: POPUP_W, top: pos.top, left: pos.left }}
      >
        <div className="flex justify-center pt-2 pb-1" aria-hidden>
          <span className="h-0.5 w-9 rounded-full bg-[color:var(--messenger-text)] opacity-80" />
        </div>

        {step === "main" ? (
          <>
            <div className="border-b border-[color:var(--messenger-divider)] px-3 pb-2 pt-0.5">
              <p id={titleId} className="truncate text-[14px] font-semibold" style={{ color: "var(--messenger-text)" }}>
                {profile.label}
              </p>
              <p className="truncate text-[11px]" style={{ color: "var(--messenger-text-secondary)" }}>
                {profile.subtitle?.trim() || `ID · ${pid.slice(0, 8)}…`}
              </p>
            </div>

            <div className="grid grid-cols-2 divide-x divide-[color:var(--messenger-divider)] border-b border-[color:var(--messenger-divider)]">
              <button
                type="button"
                onClick={() => {
                  onChat();
                  onClose();
                }}
                disabled={anyBusy}
                className="flex flex-col items-center gap-1 py-3 active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
                style={{ color: "var(--messenger-text)" }}
              >
                <IconChatOutline className="h-6 w-6" />
                <span className="text-[13px] font-medium">{bChat ? "연결 중…" : "1:1 채팅"}</span>
              </button>
              <button
                type="button"
                onClick={() => setStep("call")}
                disabled={anyBusy}
                className="flex flex-col items-center gap-1 py-3 active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
                style={{ color: "var(--messenger-text)" }}
              >
                <IconPhoneOutline className="h-6 w-6" />
                <span className="text-[13px] font-medium">통화</span>
              </button>
            </div>

            {showMuteRow && onToggleMute ? (
              <button
                type="button"
                onClick={() => {
                  onToggleMute();
                  onClose();
                }}
                disabled={anyBusy || typeof directRoomMuted !== "boolean" || notificationsBusy}
                className="flex w-full min-h-[var(--ui-tap-min,44px)] items-center justify-between px-3 py-2.5 text-left active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
                style={{ color: "var(--messenger-text)" }}
              >
                <span className="text-[14px] font-medium">
                  {notificationsBusy
                    ? "처리 중…"
                    : typeof directRoomMuted === "boolean"
                      ? directRoomMuted
                        ? "대화 알림 켜기"
                        : "대화 알림 끄기"
                      : "대화 알림"}
                </span>
              </button>
            ) : null}
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 border-b border-[color:var(--messenger-divider)] px-2 py-1.5">
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
            <button
              type="button"
              onClick={() => {
                onVoiceCall();
                onClose();
              }}
              disabled={anyBusy}
              className="flex w-full items-center gap-3 border-b border-[color:var(--messenger-divider)] px-3 py-2.5 text-left active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
            >
              <span className="text-[color:var(--messenger-text)]">
                <IconPhoneOutline className="h-6 w-6 shrink-0" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium" style={{ color: "var(--messenger-text)" }}>
                  {bVoice ? "연결 중…" : "음성 통화"}
                </span>
                <span className="block text-[10px]" style={{ color: "var(--messenger-text-secondary)" }}>
                  보이스톡
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                onVideoCall();
                onClose();
              }}
              disabled={anyBusy}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left active:bg-[color:var(--messenger-primary-soft)] disabled:opacity-50"
            >
              <span className="text-[color:var(--messenger-text)]">
                <IconVideoOutline className="h-6 w-6 shrink-0" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium" style={{ color: "var(--messenger-text)" }}>
                  {bVideo ? "연결 중…" : "영상 통화"}
                </span>
                <span className="block text-[10px]" style={{ color: "var(--messenger-text-secondary)" }}>
                  페이스톡
                </span>
              </span>
            </button>
          </>
        )}
      </div>
    </>,
    document.body
  );
}
