"use client";

import { Headphones, Monitor, PhoneOff } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallAvatar } from "./CallAvatar";
import { CallActionBar } from "./CallActionBar";
import { CallStatusText } from "./CallStatusText";
import { SlideToAccept } from "./SlideToAccept";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

export function IncomingCallView({ vm }: { vm: CallScreenViewModel }) {
  const accept = vm.primaryActions.find((a) => a.icon === "accept" || a.tone === "accept") ?? null;
  const decline = vm.primaryActions.find((a) => a.icon === "decline" || a.tone === "danger") ?? null;
  const canAccept = Boolean(accept && !accept.disabled);

  const callKindLine = vm.mode === "video" ? "영상 통화 수신" : "음성 통화 수신";

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col px-5 pb-[max(18px,calc(env(safe-area-inset-bottom)+10px))] pt-2">
      {decline ? (
        <div className="absolute right-4 top-[max(6px,env(safe-area-inset-top)+4px)] z-[5]">
          <button
            type="button"
            disabled={decline.disabled}
            onClick={() => decline.onClick()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-[0_12px_28px_rgba(239,68,68,0.35)] transition active:scale-[0.96] disabled:opacity-40"
            aria-label="거절"
          >
            <PhoneOff size={22} />
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="mb-5 text-center text-[13px] font-medium text-white/72 drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
          {callKindLine}
        </p>
        <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse />
        <div className="mt-8">
          <CallStatusText title={vm.peerLabel} status={vm.statusText} detail={vm.subStatusText ?? vm.footerNote ?? null} />
        </div>
      </div>

      <div className="pb-1">
        <div className="mb-5 grid grid-cols-2 gap-8 px-2">
          <button
            type="button"
            className="flex flex-col items-center gap-2 rounded-xl active:opacity-90"
            onClick={() => showMessengerSnackbar("메시지 보내기는 준비 중입니다.")}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-md">
              <Monitor size={24} />
            </span>
            <span className="text-[12px] font-medium text-white/82">메시지 보내기</span>
          </button>
          <button
            type="button"
            className="flex flex-col items-center gap-2 rounded-xl active:opacity-90"
            onClick={() => showMessengerSnackbar("나중에 알림은 준비 중입니다.")}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-md">
              <Headphones size={24} />
            </span>
            <span className="text-[12px] font-medium text-white/82">나중에 알림</span>
          </button>
        </div>

        <SlideToAccept
          label="밀어서 통화하기"
          disabled={!canAccept}
          onAccept={() => {
            if (accept && !accept.disabled) accept.onClick();
          }}
        />
        {vm.secondaryActions?.length ? (
          <div className="mt-5">
            <CallActionBar actions={vm.secondaryActions} compact />
          </div>
        ) : null}
      </div>
    </div>
  );
}
