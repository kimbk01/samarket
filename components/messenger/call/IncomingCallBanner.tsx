"use client";

import { Maximize2, Phone, PhoneOff } from "lucide-react";

export type IncomingCallBannerProps = {
  peerLabel: string;
  busyReject: boolean;
  busyAccept: boolean;
  onExpand: () => void;
  onReject: () => void;
  onAccept: () => void;
};

/** 수신 최소화 바 — 메시지·다른 화면 위 fixed, 한 번 탭으로 수락 가능 */
export function IncomingCallBanner(props: IncomingCallBannerProps) {
  const { peerLabel, busyReject, busyAccept, onExpand, onReject, onAccept } = props;
  return (
    <div
      className="pointer-events-auto fixed inset-x-0 bottom-[max(12px,env(safe-area-inset-bottom))] z-[60] px-3"
      role="dialog"
      aria-label="수신 통화"
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-[20px] border border-white/12 bg-[#121214] px-4 py-3 shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
        <button
          type="button"
          onClick={onExpand}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-[0.96]"
          aria-label="통화 창 펼치기"
        >
          <Maximize2 size={20} strokeWidth={2.2} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white">{peerLabel}</p>
          <p className="truncate text-[12px] text-zinc-400">전화가 오고 있습니다…</p>
        </div>
        <button
          type="button"
          disabled={busyReject || busyAccept}
          onClick={onReject}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ef4444] text-white shadow-md transition active:scale-[0.96] disabled:opacity-40"
          aria-label="거절"
        >
          <PhoneOff size={22} />
        </button>
        <button
          type="button"
          disabled={busyAccept}
          onClick={onAccept}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#22c55e] text-white shadow-md transition active:scale-[0.96] disabled:opacity-40"
          aria-label="수락"
        >
          <Phone size={22} className="rotate-[135deg]" />
        </button>
      </div>
    </div>
  );
}
