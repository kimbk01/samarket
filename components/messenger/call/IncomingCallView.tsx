"use client";

import { ChevronDown, Phone, PhoneOff } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallAvatar } from "./CallAvatar";

/** 수신 벨 화면 — 카카오톡형: 풀스크린, 상단 내리기, 하단 거절(빨강)·수락(초록). */
export function IncomingCallView({ vm }: { vm: CallScreenViewModel }) {
  const accept = vm.primaryActions.find((a) => a.icon === "accept" || a.tone === "accept") ?? null;
  const decline = vm.primaryActions.find((a) => a.icon === "decline" || a.tone === "danger") ?? null;

  const peerName = vm.peerLabel.trim() || "?";
  const callKindLine = vm.mode === "video" ? "영상통화" : "음성통화";

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col bg-[#1b1b1d] px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))]">
      <div className="flex shrink-0 justify-center pt-1">
        <button
          type="button"
          onClick={() => vm.onBack?.()}
          className="flex flex-col items-center gap-0.5 text-white/55 transition active:scale-[0.98] active:text-white/80"
          aria-label="통화 창 최소화"
        >
          <ChevronDown size={28} strokeWidth={2} className="-mb-0.5" />
          <span className="text-[11px] font-medium tracking-wide">내리기</span>
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2">
        <div className="scale-[1.06]">
          <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse placeholderTone="orange" />
        </div>
        <h2 className="mt-10 text-center text-[26px] font-semibold tracking-tight text-white">{peerName}</h2>
        <p className="mt-2 text-center text-[16px] text-white/55">{callKindLine}</p>
        {vm.subStatusText ? (
          <p className="mt-4 max-w-[300px] text-center text-[13px] leading-snug text-amber-200/85">{vm.subStatusText}</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-center gap-[52px] pb-2 pt-4">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={decline?.disabled}
            onClick={() => decline?.onClick()}
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-[0_14px_36px_rgba(255,59,48,0.42)] transition active:scale-[0.96] disabled:opacity-40"
            aria-label="거절"
          >
            <PhoneOff size={30} strokeWidth={2.2} />
          </button>
          <span className="text-[12px] font-medium text-white/45">거절</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            disabled={accept?.disabled}
            onClick={() => accept?.onClick()}
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-[#22c55e] text-white shadow-[0_14px_36px_rgba(34,197,94,0.42)] transition active:scale-[0.96] disabled:opacity-40"
            aria-label="수락"
          >
            <Phone size={30} className="-rotate-[35deg]" strokeWidth={2.2} />
          </button>
          <span className="text-[12px] font-medium text-white/45">수락</span>
        </div>
      </div>
    </div>
  );
}
