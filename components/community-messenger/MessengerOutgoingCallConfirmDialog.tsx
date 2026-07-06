"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { COMMUNITY_OVERLAY_BACKDROP_CLASS } from "@/lib/philife/philife-flat-ui-classes";

/** DIBAY 1:1 발신 확인 — iOS-style action blue (카톡 레거시 레이아웃) */
const OUTGOING_CONFIRM_ACTION_COLOR = "#007AFF";

const OUTGOING_CONFIRM_ACTION_CLASS =
  "flex h-11 flex-1 items-center justify-center text-[17px] font-normal leading-none transition-none touch-manipulation active:bg-[rgba(0,0,0,0.14)] disabled:cursor-not-allowed disabled:opacity-40";

/** call_stub pointerup 직후 ghost click이 backdrop onCancel을 치는 touch-through 방지 (MessageLongPressPopover 동일). */
const BACKDROP_DISMISS_GUARD_MS = 350;

/**
 * 1:1 발신 전 확인 — 취소 | 통화 2분할. `busy` 시 통화 버튼만 비활성.
 */
export type MessengerOutgoingCallConfirmDialogProps = {
  open: boolean;
  /** 접근성 라벨용. UI에는 표시하지 않음. */
  peerLabel: string;
  kind: "voice" | "video";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MessengerOutgoingCallConfirmDialog(props: MessengerOutgoingCallConfirmDialogProps) {
  const { t, safeT } = useI18n();
  const { open, peerLabel, kind, busy = false, onCancel, onConfirm } = props;

  const title =
    kind === "video"
      ? safeT("cm_ui_face_talk_label", { fallbackKo: "영상통화", fallbackEn: "Video Call" })
      : safeT("cm_ui_voice_talk_label", { fallbackKo: "음성통화", fallbackEn: "Voice Call" });
  const dialogLabel = `${peerLabel.trim() || t("common_partner")} ${title}`;
  const openedAtRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    openedAtRef.current = Date.now();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const isBackdropDismissGuarded = () => Date.now() - openedAtRef.current < BACKDROP_DISMISS_GUARD_MS;

  const handleBackdropPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isBackdropDismissGuarded()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!busy) onCancel();
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isBackdropDismissGuarded()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (!busy) onCancel();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center px-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="outgoing-call-confirm-title"
      aria-describedby="outgoing-call-confirm-body"
      aria-busy={busy}
      aria-label={dialogLabel}
    >
      <button
        type="button"
        className={COMMUNITY_OVERLAY_BACKDROP_CLASS}
        aria-label={t("nav_close")}
        onPointerDown={handleBackdropPointerDown}
        onClick={handleBackdropClick}
      />
      <div
        className="relative z-50 w-[270px] max-w-[calc(100vw-40px)] overflow-hidden rounded-[14px] border border-black/[0.04] bg-white/90 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 pt-[22px] pb-[18px] text-center">
          <h2
            id="outgoing-call-confirm-title"
            className="text-[17px] font-semibold leading-snug tracking-tight text-black"
          >
            {title}
          </h2>
          <p id="outgoing-call-confirm-body" className="mt-2 text-[13px] font-normal leading-[1.45] text-black">
            {t("cm_ui_start_call_question")}
          </p>
        </div>
        <div className="flex border-t border-black/10">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className={OUTGOING_CONFIRM_ACTION_CLASS}
            style={{ color: OUTGOING_CONFIRM_ACTION_COLOR }}
          >
            {t("common_cancel")}
          </button>
          <div className="w-px shrink-0 self-stretch bg-black/10" aria-hidden />
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={OUTGOING_CONFIRM_ACTION_CLASS}
            style={{ color: OUTGOING_CONFIRM_ACTION_COLOR }}
          >
            {t("cm_ui_call")}
          </button>
        </div>
      </div>
    </div>
  );
}
