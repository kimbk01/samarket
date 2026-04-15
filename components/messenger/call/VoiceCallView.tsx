"use client";

import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallAvatar } from "./CallAvatar";
import { CallStatusText } from "./CallStatusText";
import { useCallTimer } from "./useCallTimer";

/**
 * 음성 통화 전용 — ringing / connecting / connected 를 한 레이아웃에서 처리해
 * OutgoingCallView ↔ ConnectedVoiceView 전환 시 레이아웃이 깜빡이지 않게 한다.
 * (수신 ringing 은 수락·거절 레이아웃이 달라 IncomingCallView 유지)
 */
export function VoiceCallView({ vm }: { vm: CallScreenViewModel }) {
  const timer = useCallTimer({
    connectedAt: vm.connectedAt,
    endedAt: vm.endedAt,
    endedDurationSeconds: vm.endedDurationSeconds,
  });

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-end px-5 pb-[max(14px,calc(env(safe-area-inset-bottom)+8px))] pt-4">
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center">
          <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse={vm.phase === "ringing"} />
          <div className="mt-8">
            <CallStatusText
              title={vm.peerLabel}
              status={vm.statusText}
              timer={timer}
              detail={vm.connectionLabel ?? vm.subStatusText ?? vm.footerNote ?? null}
            />
          </div>
        </div>
      </div>
      <div className="rounded-t-3xl bg-gradient-to-t from-black/62 via-black/28 to-transparent px-1 pt-12 pb-1">
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
