"use client";

import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallStatusText } from "./CallStatusText";
import { MiniLocalVideo } from "./MiniLocalVideo";
import { useCallTimer } from "./useCallTimer";

export function ConnectedVideoView({ vm }: { vm: CallScreenViewModel }) {
  const timer = useCallTimer({
    connectedAt: vm.connectedAt,
    endedAt: vm.endedAt,
    endedDurationSeconds: vm.endedDurationSeconds,
  });

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-between">
      <div className="relative min-h-0 flex-1">
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
          <div className="absolute left-4 top-[4.4rem] z-[3] rounded-full bg-black/28 px-3 py-1.5 text-[12px] font-medium text-white/90 backdrop-blur-sm">
            {vm.participantsSummary}
          </div>
        ) : null}
      </div>
      <div className="relative z-[3] px-6 pb-[max(18px,calc(env(safe-area-inset-bottom)+8px))]">
        {vm.showRemoteVideo ? (
          <div className="mb-5 text-center">
            <CallStatusText title={vm.peerLabel} status={vm.statusText} timer={timer} detail={vm.connectionLabel ?? null} />
          </div>
        ) : null}
        <CallActionBar actions={vm.primaryActions} />
        {vm.secondaryActions?.length ? <div className="mt-5"><CallActionBar actions={vm.secondaryActions} compact /></div> : null}
      </div>
    </div>
  );
}
