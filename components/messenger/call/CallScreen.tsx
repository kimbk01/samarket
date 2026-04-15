"use client";

import { useEffect } from "react";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import { CallBackground } from "./CallBackground";
import { CallHeader } from "./CallHeader";
import { ConnectedVideoView } from "./ConnectedVideoView";
import { EndedCallView } from "./EndedCallView";
import { IncomingCallView } from "./IncomingCallView";
import { OutgoingCallView } from "./OutgoingCallView";
import { VoiceCallView } from "./VoiceCallView";
import type { CallScreenViewModel } from "./call-ui.types";

export function CallScreen({
  vm,
  variant = "overlay",
}: {
  vm: CallScreenViewModel;
  variant?: "overlay" | "page";
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
    <CallScreenShell variant={variant} className="min-h-[100dvh] overflow-hidden">
      <CallBackground
        mode={vm.mode}
        phase={vm.phase}
        videoSlot={vm.mainVideoSlot}
        showVideo={vm.mode === "video" && Boolean(vm.mainVideoSlot)}
      />
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        <CallHeader
          onBack={vm.onBack}
          topLabel={vm.topLabel}
          onTopLabelClick={vm.onTopLabelClick}
          trailing={null}
        />
        {renderCallView(vm)}
      </div>
    </CallScreenShell>
  );
}

function renderCallView(vm: CallScreenViewModel) {
  if (vm.phase === "ended" || vm.phase === "declined" || vm.phase === "missed" || vm.phase === "failed") {
    return <EndedCallView vm={vm} />;
  }
  if (vm.direction === "incoming" && vm.phase === "ringing") {
    return <IncomingCallView vm={vm} />;
  }
  if (vm.mode === "video" && (vm.phase === "connected" || vm.phase === "connecting")) {
    return <ConnectedVideoView vm={vm} />;
  }
  if (
    vm.mode === "voice" &&
    !(vm.direction === "incoming" && vm.phase === "ringing")
  ) {
    return <VoiceCallView vm={vm} />;
  }
  return <OutgoingCallView vm={vm} />;
}
