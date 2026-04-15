"use client";

/**
 * 발신 전 확인 — 카카오톡형 취소 / 통화 2버튼.
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
  if (!open) return null;

  const title = kind === "video" ? "영상통화" : "음성통화";
  const peer = peerLabel.trim() || "상대";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-5 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="outgoing-call-confirm-title"
    >
      <div className="w-full max-w-[320px] overflow-hidden rounded-[14px] bg-[#f2f2f2] shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
        <div className="px-5 pt-6 pb-5 text-center">
          <h2 id="outgoing-call-confirm-title" className="text-[17px] font-semibold tracking-tight text-[#191919]">
            {title}
          </h2>
          <p className="mt-3 text-[15px] leading-snug text-[#191919]">
            <span className="font-semibold">{peer}</span>
            <span className="font-normal">님에게 전화를 걸까요?</span>
          </p>
        </div>
        <div className="flex border-t border-black/10">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[48px] flex-1 bg-[#f2f2f2] text-[16px] font-medium text-[#191919] transition active:bg-black/5 disabled:opacity-50"
          >
            취소
          </button>
          <div className="w-px bg-black/10" aria-hidden />
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="min-h-[48px] flex-1 bg-[#f2f2f2] text-[16px] font-semibold text-[#0078ff] transition active:bg-black/5 disabled:opacity-50"
          >
            통화
          </button>
        </div>
      </div>
    </div>
  );
}
