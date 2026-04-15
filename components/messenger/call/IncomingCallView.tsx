"use client";

import { BellOff, Check, ChevronDown, MessageCircle, Phone, PhoneOff, Video } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";

/** 수신 벨 화면 — Viber 톤: 딥 퍼플 배경, 하단 거절/응답. */
export function IncomingCallView({ vm }: { vm: CallScreenViewModel }) {
  const accept = vm.primaryActions.find((a) => a.icon === "accept" || a.tone === "accept") ?? null;
  const decline = vm.primaryActions.find((a) => a.icon === "decline" || a.tone === "danger") ?? null;

  const peerName = vm.peerLabel.trim() || "?";
  const callKindLine = vm.mode === "video" ? "영상 통화" : "음성 통화";

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,#6b3df1_0%,#4d2cb1_34%,#251447_100%)] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(8px,env(safe-area-inset-top))]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.14),transparent_38%),radial-gradient(circle_at_50%_90%,rgba(255,255,255,0.06),transparent_34%)]" />
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

      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-2">
        <div className="-mt-[10vh] flex flex-col items-center">
          <div className="flex items-center gap-1.5 text-[15px] font-semibold text-white/72">
            {vm.mode === "video" ? (
              <Video size={16} className="opacity-80" />
            ) : (
              <Phone size={15} className="opacity-80" />
            )}
            <span>{callKindLine}</span>
          </div>
          <h2 className="mt-2 text-center text-[26px] font-bold tracking-tight text-white">{peerName}</h2>
        </div>
        {vm.subStatusText ? (
          <p className="mt-4 max-w-[300px] text-center text-[13px] leading-snug text-white/68">{vm.subStatusText}</p>
        ) : null}

        <div className="mt-auto flex w-full max-w-[360px] items-center justify-between pb-[max(4px,env(safe-area-inset-bottom))]">
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => vm.onBack?.()}
            className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-white/16 text-white/92 backdrop-blur-sm transition active:scale-[0.96]"
              aria-label="메시지 보내기"
            >
              <MessageCircle size={22} />
            </button>
            <span className="text-[13px] font-medium text-white/88">메시지 보내기</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => vm.onBack?.()}
            className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-white/16 text-white/92 backdrop-blur-sm transition active:scale-[0.96]"
              aria-label="나중에 알림"
            >
              <BellOff size={22} />
            </button>
            <span className="text-[13px] font-medium text-white/88">나중에 알림</span>
          </div>
        </div>
      </div>

      <div className="relative flex shrink-0 items-center justify-center gap-[78px] pb-2 pt-4">
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={decline?.disabled}
            onClick={() => decline?.onClick()}
            className="flex h-[90px] w-[90px] shrink-0 items-center justify-center rounded-full bg-[#ef3b2d] text-white shadow-[0_14px_36px_rgba(239,59,45,0.4)] transition active:scale-[0.96] disabled:opacity-40"
            aria-label="거절"
          >
            <PhoneOff size={38} strokeWidth={2.6} />
          </button>
          <span className="text-[17px] font-medium text-white/92">거절</span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            disabled={accept?.disabled}
            onClick={() => accept?.onClick()}
            className="flex h-[90px] w-[90px] shrink-0 items-center justify-center rounded-full bg-[#6b3df1] text-white shadow-[0_14px_36px_rgba(107,61,241,0.42)] transition active:scale-[0.96] disabled:opacity-40"
            aria-label="응답"
          >
            <Check size={42} strokeWidth={3.2} />
          </button>
          <span className="text-[17px] font-medium text-white/92">응답</span>
        </div>
      </div>
    </div>
  );
}
