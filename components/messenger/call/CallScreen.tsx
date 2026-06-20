"use client";

import { useEffect, useRef } from "react";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import type { CallPresentationShellSurface } from "@/lib/community-messenger/call-presentation-state";
import { CallBackground } from "./CallBackground";
import { CallHeader } from "./CallHeader";
import { ConnectedVideoView } from "./ConnectedVideoView";
import { EndedCallView } from "./EndedCallView";
import { IncomingCallView } from "./IncomingCallView";
import { OutgoingCallPanel } from "./OutgoingCallPanel";
import { VoiceCallView } from "./VoiceCallView";
import type { CallScreenViewModel } from "./call-ui.types";
import { useCallPresentationState } from "./useCallPresentationState";

/** 음성 발신 벨 — `OutgoingCallView` 와 동일, 셸 전체 배경용 */
const OUTGOING_VOICE_RING_SURFACE =
  "bg-[linear-gradient(180deg,#6b3df1_0%,#5a35d8_28%,#3d2699_55%,#2a1a6e_100%)]";
const STARBUCKS_CALL_SURFACE =
  "bg-[radial-gradient(circle_at_50%_0%,rgba(212,233,226,0.24),transparent_34%),linear-gradient(180deg,#00754A_0%,#006241_44%,#003D29_100%)]";
const TELEGRAM_CALL_SURFACE = "bg-[#8B5E2E]";

function resolveShellSurfaceClassName(
  shellSurface: CallPresentationShellSurface,
  visualTheme: CallScreenViewModel["visualTheme"]
): string | undefined {
  if (shellSurface === "videoBlack") return "bg-black";
  if (shellSurface === "starbucks" || visualTheme === "starbucks") return STARBUCKS_CALL_SURFACE;
  if (shellSurface === "telegramSolid") return TELEGRAM_CALL_SURFACE;
  if (shellSurface === "outgoingVoiceRing") return OUTGOING_VOICE_RING_SURFACE;
  return undefined;
}

export function CallScreen({
  vm,
  variant = "overlay",
}: {
  vm: CallScreenViewModel;
  variant?: "overlay" | "page" | "dock-top";
}) {
  const presentation = useCallPresentationState(vm);

  /** secondaryActions 배열 참조가 매 렌더 바뀌면 타이머가 끝까지 가지 못함 — ref 로 최신 닫기만 실행 */
  const terminalCloseRef = useRef<(() => void) | null>(null);
  terminalCloseRef.current =
    vm.secondaryActions?.find((item) => item.icon === "close")?.onClick ?? null;
  useEffect(() => {
    if (!vm.autoCloseMs) return;
    const timer = window.setTimeout(() => {
      terminalCloseRef.current?.();
    }, vm.autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [vm.autoCloseMs]);

  const usesConnectedVideoView =
    presentation.layout === "videoAvatarBridge" || presentation.layout === "videoConnected";
  const hideCallBackground =
    presentation.shellSurface !== "default" || usesConnectedVideoView;
  const shellSurfaceClassName = resolveShellSurfaceClassName(presentation.shellSurface, vm.visualTheme);
  const showCallHeader =
    presentation.layout !== "incomingRing" &&
    presentation.layout !== "outgoingVoiceRing" &&
    !(vm.mode === "video" && vm.direction === "outgoing");

  return (
    <CallScreenShell
      variant={variant === "dock-top" ? "dock-top" : variant}
      surfaceClassName={shellSurfaceClassName}
      networkWarningClassName={vm.showNetworkWarningBorder ? vm.networkWarningClassName : null}
      networkQualityLevel={vm.networkQualityLevel ?? null}
      className={
        variant === "dock-top"
          ? "min-h-0 overflow-hidden rounded-b-3xl shadow-2xl"
          : variant === "page"
            ? "min-h-0 overflow-hidden"
            : "h-full min-h-0 overflow-hidden"
      }
    >
      {hideCallBackground ? null : (
        <CallBackground
          mode={vm.mode}
          phase={vm.phase}
          theme={vm.visualTheme}
          videoSlot={vm.mainVideoSlot}
          showVideo={vm.mode === "video" && Boolean(vm.mainVideoSlot)}
        />
      )}
      <div
        className={`relative z-[1] flex min-h-0 flex-1 flex-col ${usesConnectedVideoView ? "h-full" : ""}`.trim()}
      >
        {showCallHeader ? (
          <CallHeader
            onBack={vm.onBack}
            topLabel={vm.topLabel}
            onTopLabelClick={vm.onTopLabelClick}
            trailing={null}
          />
        ) : null}
        {renderCallView(vm, presentation.layout)}
      </div>
    </CallScreenShell>
  );
}

function renderCallView(
  vm: CallScreenViewModel,
  layout: ReturnType<typeof useCallPresentationState>["layout"]
) {
  if (layout === "terminal") {
    if (vm.suppressTerminalView) return null;
    return <EndedCallView vm={vm} />;
  }
  if (layout === "incomingRing") {
    return <IncomingCallView vm={vm} />;
  }
  if (layout === "outgoingVoiceRing") {
    return <OutgoingCallPanel vm={vm} />;
  }
  if (layout === "videoAvatarBridge" || layout === "videoConnected") {
    return <ConnectedVideoView vm={vm} />;
  }
  if (layout === "voiceUnified") {
    return <VoiceCallView vm={vm} />;
  }
  return <OutgoingCallPanel vm={vm} />;
}
