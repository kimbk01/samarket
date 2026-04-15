"use client";

import { X } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallAvatar } from "./CallAvatar";
import { CallStatusText } from "./CallStatusText";
import { useCallTimer } from "./useCallTimer";

export function EndedCallView({ vm }: { vm: CallScreenViewModel }) {
  const timer = useCallTimer({
    connectedAt: vm.connectedAt,
    endedAt: vm.endedAt,
    endedDurationSeconds: vm.endedDurationSeconds,
  });
  const close = vm.secondaryActions?.find((item) => item.icon === "close") ?? null;

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-between px-6 pb-[max(22px,calc(env(safe-area-inset-bottom)+12px))] pt-6">
      {close ? (
        <div className="absolute right-5 top-[max(14px,calc(env(safe-area-inset-top)+6px))] z-[3]">
          <button
            type="button"
            onClick={close.onClick}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#2e1a5d]/52 text-white/92 backdrop-blur-sm transition active:scale-[0.96]"
            aria-label={close.label}
          >
            <X size={22} strokeWidth={2.4} />
          </button>
        </div>
      ) : null}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center">
          <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} />
          <div className="mt-8">
            <CallStatusText title={vm.peerLabel} status={vm.statusText} timer={timer} detail={vm.subStatusText ?? vm.footerNote ?? null} />
          </div>
        </div>
      </div>
      <div className="space-y-6">
        <CallActionBar actions={vm.primaryActions} />
      </div>
    </div>
  );
}
