"use client";

import { ChevronDown, Phone, PhoneOff } from "lucide-react";

export type IncomingCallBannerProps = {
  peerLabel: string;
  callKind?: "voice" | "video";
  busyReject: boolean;
  busyAccept: boolean;
  onExpand: () => void;
  onReject: () => void;
  onAccept: () => void;
};

/** 수신 최소화 — 상단 배너(카카오톡 앱 내 다작업 시 유사). */
export function IncomingCallBanner(props: IncomingCallBannerProps) {
  const { peerLabel, callKind = "voice", busyReject, busyAccept, onExpand, onReject, onAccept } = props;
  const kindLine = callKind === "video" ? "영상통화 수신" : "음성통화 수신";

  return (
    <div
      className="pointer-events-auto fixed inset-x-0 top-[max(8px,env(safe-area-inset-top))] z-[60] px-3"
      role="dialog"
      aria-label="수신 통화"
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-[14px] border border-white/10 bg-[#2c2c2e]/95 px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <button
          type="button"
          onClick={onExpand}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-white transition active:scale-[0.96]"
          aria-label="통화 화면 열기"
        >
          <ChevronDown size={22} strokeWidth={2.2} className="rotate-180" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-white">{peerLabel}</p>
          <p className="truncate text-[12px] text-white/55">{kindLine}</p>
        </div>
        <button
          type="button"
          disabled={busyReject || busyAccept}
          onClick={onReject}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ff3b30] text-white transition active:scale-[0.96] disabled:opacity-40"
          aria-label="거절"
        >
          <PhoneOff size={22} strokeWidth={2.2} />
        </button>
        <button
          type="button"
          disabled={busyAccept}
          onClick={onAccept}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#22c55e] text-white transition active:scale-[0.96] disabled:opacity-40"
          aria-label="수락"
        >
          <Phone size={22} className="-rotate-[35deg]" strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
