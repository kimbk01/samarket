"use client";

import { useEffect } from "react";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import { CallBackground } from "./CallBackground";
import { CallHeader } from "./CallHeader";
import { ConnectedVideoView } from "./ConnectedVideoView";
import { EndedCallView } from "./EndedCallView";
import { IncomingCallView } from "./IncomingCallView";
import { OutgoingCallPanel } from "./OutgoingCallPanel";
import { VoiceCallView } from "./VoiceCallView";
import type { CallScreenViewModel } from "./call-ui.types";

export function CallScreen({
  vm,
  variant = "overlay",
}: {
  vm: CallScreenViewModel;
  variant?: "overlay" | "page" | "dock-top";
}) {
  useEffect(() => {
    if (!vm.autoCloseMs || !vm.secondaryActions?.length) return;
    const close = vm.secondaryActions.find((item) => item.icon === "close");
    if (!close) return;
    const timer = window.setTimeout(() => {
      close.onClick();
    }, vm.autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [vm.autoCloseMs, vm.secondaryActions]);

  return (
    <CallScreenShell
      variant={variant === "dock-top" ? "dock-top" : variant}
      className={variant === "dock-top" ? "min-h-0 overflow-hidden rounded-b-3xl shadow-2xl" : "min-h-[100dvh] overflow-hidden"}
    >
      <CallBackground
        mode={vm.mode}
        phase={vm.phase}
        videoSlot={vm.mainVideoSlot}
        showVideo={vm.mode === "video" && Boolean(vm.mainVideoSlot) && !(vm.direction === "outgoing" && vm.phase === "ringing")}
      />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        {!(vm.direction === "incoming" && vm.phase === "ringing") ? (
          <CallHeader
            onBack={vm.onBack}
            topLabel={vm.topLabel}
            onTopLabelClick={vm.onTopLabelClick}
            trailing={null}
          />
        ) : null}
        {renderCallView(vm, variant)}
      </div>
    </CallScreenShell>
  );
}

function renderCallView(
  vm: CallScreenViewModel,
  variant: "overlay" | "page" | "dock-top",
) {
  if (vm.phase === "ended" || vm.phase === "declined" || vm.phase === "missed" || vm.phase === "failed") {
    return <EndedCallView vm={vm} />;
  }
  if (vm.direction === "incoming" && vm.phase === "ringing") {
    return <IncomingCallView vm={vm} dockTop={variant === "dock-top"} />;
  }
  if (vm.direction === "outgoing" && vm.phase === "ringing") {
    return <OutgoingCallPanel vm={vm} />;
  }
  /** 영상: 벨·연결·통화 중 모두 동일 풀스크린 레이아웃(발신 시 로컬 프리뷰가 배경 전체). */
  if (vm.mode === "video") {
    return <ConnectedVideoView vm={vm} />;
  }
  if (vm.mode === "voice" && !(vm.direction === "incoming" && vm.phase === "ringing")) {
    return <VoiceCallView vm={vm} />;
  }
  return <OutgoingCallPanel vm={vm} />;
}
