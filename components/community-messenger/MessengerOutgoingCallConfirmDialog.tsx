"use client";

import { useEffect } from "react";

/**
 * 발신 전 확인 — 취소 / 통화 2버튼. `busy` 시 연결 진행 중임을 표시한다.
 */
export type MessengerOutgoingCallConfirmDialogProps = {
  open: boolean;
  peerLabel: string;
  kind: "voice" | "video";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function MessengerOutgoingCallConfirmDialog(props: MessengerOutgoingCallConfirmDialogProps) {
  const { open, peerLabel, kind, busy = false, onCancel, onConfirm } = props;

  const title = kind === "video" ? "영상 통화" : "음성 통화";
  const dialogLabel = `${peerLabel.trim() || "상대"} ${title}`;
  const peer = peerLabel.trim() || "상대방";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-5 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="outgoing-call-confirm-title"
      aria-busy={busy}
      aria-label={dialogLabel}
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-[320px] overflow-hidden rounded-[16px] bg-[linear-gradient(180deg,#f5f2ff_0%,#ede7ff_100%)] shadow-[0_20px_60px_rgba(20,10,52,0.35)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-6 pb-5 text-center">
          <h2 id="outgoing-call-confirm-title" className="sam-text-section-title font-semibold tracking-tight text-[#2d1d55]">
            {title}
          </h2>
          <p className="mt-1 sam-text-body-secondary font-medium text-[#2d1d55]/85">{peer}</p>
          <p className="mt-2 sam-text-body leading-snug text-[#2d1d55]">통화를 시작하시겠습니까?</p>
        </div>
        <div className="flex border-t border-[#2d1d55]/10">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[48px] flex-1 bg-transparent sam-text-body-lg font-medium text-[#2d1d55] transition active:bg-[#2d1d55]/5 disabled:opacity-50"
          >
            취소
          </button>
          <div className="w-px bg-[#2d1d55]/10" aria-hidden />
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="min-h-[48px] flex-1 bg-transparent sam-text-body-lg font-semibold text-[#6b3df1] transition active:bg-[#2d1d55]/5 disabled:opacity-50"
          >
            통화
          </button>
        </div>
      </div>
    </div>
  );
}
