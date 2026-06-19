"use client";

import { useEffect, useRef } from "react";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import {
  resolveCallOverlayBackdropMode,
  shouldUseTranslucentCallShell,
  TRANSLUCENT_CALL_SHELL_SURFACE,
} from "@/lib/community-messenger/call-video-layout";
import { CallOverlayBackdrop } from "./CallOverlayBackdrop";
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

  /** 수락 전 수신 벨은 음성/영상 모두 미디어 preview 없이 동일한 수신 화면을 쓴다. */
  const isIncomingRinging = vm.direction === "incoming" && vm.phase === "ringing";
  const isOutgoingVoiceRinging = vm.direction === "outgoing" && vm.phase === "ringing" && vm.mode === "voice";
  const isIncomingVideoRinging = vm.mode === "video" && isIncomingRinging;
  const usesConnectedVideoView = vm.mode === "video" && !isIncomingVideoRinging;

  const overlayBackdropMode =
    vm.overlayBackdropMode ??
    resolveCallOverlayBackdropMode({
      mode: vm.mode,
      direction: vm.direction,
      phase: vm.phase,
      showRemoteVideo: vm.showRemoteVideo,
      pipFirstOutgoingMainPlaceholder: vm.pipFirstOutgoingMainPlaceholder,
    });

  const shellVariant = variant === "dock-top" ? "dock-top" : variant;
  const useTranslucentShell = shouldUseTranslucentCallShell({ variant: shellVariant });
  const shellSurfaceClassName = useTranslucentShell ? TRANSLUCENT_CALL_SHELL_SURFACE : undefined;

  /** 발신 영상·음성 벨 — 브라우저 내 `< 뒤로` 헤더 없이 safe-area 만 사용 */
  const showCallHeader =
    !(vm.direction === "incoming" && vm.phase === "ringing") &&
    !(vm.mode === "video" && vm.direction === "outgoing") &&
    !(isOutgoingVoiceRinging);

  return (
    <CallScreenShell
      variant={shellVariant}
      surfaceClassName={shellSurfaceClassName}
      className={
        variant === "dock-top"
          ? "min-h-0 overflow-hidden rounded-b-3xl shadow-2xl"
          : variant === "page"
            ? "min-h-0 overflow-hidden"
            : "h-full min-h-0 overflow-hidden"
      }
    >
      <CallOverlayBackdrop
        mode={overlayBackdropMode}
        peerAvatarUrl={vm.peerAvatarUrl}
        peerLabel={vm.peerLabel}
        theme={vm.visualTheme}
      />
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
        {renderCallView(vm)}
      </div>
    </CallScreenShell>
  );
}

function renderCallView(vm: CallScreenViewModel) {
  const isTerminalPhase =
    vm.phase === "ended" || vm.phase === "declined" || vm.phase === "missed" || vm.phase === "failed";
  if (isTerminalPhase && vm.suppressTerminalView) {
    return null;
  }
  if (isTerminalPhase && !vm.suppressTerminalView) {
    return <EndedCallView vm={vm} />;
  }
  if (vm.direction === "incoming" && vm.phase === "ringing") {
    return <IncomingCallView vm={vm} />;
  }
  /** 음성 발신 벨만 전용 패널 — 영상 발신은 아래와 동일 풀스크린으로 통일 */
  if (vm.direction === "outgoing" && vm.phase === "ringing" && vm.mode === "voice") {
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
