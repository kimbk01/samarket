"use client";

import type { CallScreenViewModel } from "./call-ui.types";
import { CallAvatar } from "./CallAvatar";
import { CallControlBar } from "./CallControlBar";
import { CallStatusText } from "./CallStatusText";
import { useCallTimer } from "./useCallTimer";

/**
 * 음성 통화 전용 — ringing / connecting / connected 를 한 레이아웃에서 처리해
 * OutgoingCallView ↔ ConnectedVoiceView 전환 시 레이아웃이 깜빡이지 않게 한다.
 * (수신 ringing 은 Global compact 배너 — `CommunityMessengerIncomingCallUi`)
 */
export function VoiceCallView({ vm }: { vm: CallScreenViewModel }) {
  const isStarbucks = vm.visualTheme === "starbucks";
  const timer = useCallTimer({
    connectedAt: vm.connectedAt,
    endedAt: vm.endedAt,
    endedDurationSeconds: vm.endedDurationSeconds,
  });

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col justify-end px-5 pb-[max(14px,calc(var(--safe-bottom)+8px))] pt-4">
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center">
          <CallAvatar
            label={vm.peerLabel}
            avatarUrl={vm.peerAvatarUrl}
            pulse={vm.phase === "ringing"}
            theme={vm.visualTheme}
          />
          <div className="mt-8">
            <CallStatusText
              title={vm.peerLabel}
              status={vm.statusText}
              timer={timer}
              detail={vm.connectionLabel ?? vm.subStatusText ?? vm.footerNote ?? null}
              connectionStatusLabel={vm.connectionStatusLabel}
            />
          </div>
        </div>
      </div>
      <div
        className={`px-1 pt-12 pb-1 ${
          isStarbucks
            ? "bg-gradient-to-t from-[#003D29]/88 via-[#006241]/42 to-transparent"
            : "bg-gradient-to-t from-[#170d32]/82 via-[#2b1858]/38 to-transparent"
        }`}
      >
        <CallControlBar
          primaryActions={vm.primaryActions}
          secondaryActions={vm.secondaryActions}
          theme={vm.visualTheme}
        />
      </div>
    </div>
  );
}
