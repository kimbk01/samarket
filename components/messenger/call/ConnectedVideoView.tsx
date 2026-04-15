"use client";

import { Monitor } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallStatusText } from "./CallStatusText";
import { MiniLocalVideo } from "./MiniLocalVideo";
import { useCallTimer } from "./useCallTimer";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";

export function ConnectedVideoView({ vm }: { vm: CallScreenViewModel }) {
  const timer = useCallTimer({
    connectedAt: vm.connectedAt,
    endedAt: vm.endedAt,
    endedDurationSeconds: vm.endedDurationSeconds,
  });

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        {vm.showRemoteVideo ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[4] flex justify-center px-4 pt-[max(8px,calc(env(safe-area-inset-top)+48px))]">
            <div className="max-w-[92vw] text-center drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)]">
              <div className="text-[20px] font-semibold tracking-tight text-white">{vm.peerLabel}</div>
              <div className="mt-1 flex items-center justify-center gap-2 text-[14px] font-medium text-white/90">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.22)]" aria-hidden />
                <span>{timer ?? vm.statusText}</span>
              </div>
            </div>
          </div>
        ) : null}

        <div className="absolute right-3 z-[4] top-[max(52px,calc(env(safe-area-inset-top)+40px))]">
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition active:scale-[0.96]"
            aria-label="참가자"
            onClick={() => showMessengerSnackbar("참가자 초대는 준비 중입니다.")}
          >
            <Monitor size={22} />
          </button>
        </div>

        {!vm.showRemoteVideo ? (
          <div className="absolute inset-0 flex items-center justify-center px-8">
            <CallStatusText
              title={vm.peerLabel}
              status={vm.statusText}
              timer={timer}
              detail={vm.connectionLabel ?? vm.subStatusText ?? null}
            />
          </div>
        ) : null}
        {vm.mainVideoSlot}
        {vm.showLocalVideo ? (
          <MiniLocalVideo label="나" minimized={vm.mediaState.localVideoMinimized}>
            {vm.miniVideoSlot}
          </MiniLocalVideo>
        ) : null}
        {vm.participantsSummary ? (
          <div className="absolute left-4 top-[calc(env(safe-area-inset-top)+52px)] z-[3] rounded-full bg-black/30 px-3 py-1.5 text-[12px] font-medium text-white/90 backdrop-blur-sm">
            {vm.participantsSummary}
          </div>
        ) : null}
      </div>

      <div className="relative z-[5] bg-gradient-to-t from-black/75 via-black/38 to-transparent px-3 pb-[max(14px,calc(env(safe-area-inset-bottom)+8px))] pt-16">
        <CallActionBar actions={vm.primaryActions} />
        {vm.secondaryActions?.length ? (
          <div className="mt-4">
            <CallActionBar actions={vm.secondaryActions} compact />
          </div>
        ) : null}
      </div>
    </div>
  );
}
