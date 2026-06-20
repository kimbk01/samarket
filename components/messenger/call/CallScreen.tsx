"use client";

import { useEffect, useRef } from "react";
import { CallScreenShell } from "@/components/community-messenger/call-ui/CallScreenShell";
import { CallBackground } from "./CallBackground";
import { CallHeader } from "./CallHeader";
import { ConnectedVideoView } from "./ConnectedVideoView";
import { EndedCallView } from "./EndedCallView";
import { IncomingCallView } from "./IncomingCallView";
import { OutgoingCallPanel } from "./OutgoingCallPanel";
import { VoiceCallView } from "./VoiceCallView";
import type { CallScreenViewModel } from "./call-ui.types";

/** 음성 발신 벨 — `OutgoingCallView` 와 동일, 셸 전체 배경용 */
const OUTGOING_VOICE_RING_SURFACE =
  "bg-[linear-gradient(180deg,#6b3df1_0%,#5a35d8_28%,#3d2699_55%,#2a1a6e_100%)]";
const STARBUCKS_CALL_SURFACE =
  "bg-[radial-gradient(circle_at_50%_0%,rgba(212,233,226,0.24),transparent_34%),linear-gradient(180deg,#00754A_0%,#006241_44%,#003D29_100%)]";

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
  const useStarbucksTheme = vm.visualTheme === "starbucks";
  const telegramCallSurface = "bg-[#8B5E2E]";
  const useTelegramSolidShell = isIncomingRinging;
  const useOutgoingVoiceRingShell = isOutgoingVoiceRinging;
  /**
   * `ConnectedVideoView` 구간(수신 벨 제외)은 `mainVideoSlot`·`largeVideoRef` 단일 마운트.
   * iPad 등에서 `CallBackground`와 이중 렌더 시 ref/Agora 바인딩이 어긋나 하단 녹색 셸이 비친다.
   */
  const isIncomingVideoRinging = vm.mode === "video" && isIncomingRinging;
  const usesConnectedVideoView = vm.mode === "video" && !isIncomingVideoRinging;
  const hideCallBackground = useTelegramSolidShell || isOutgoingVoiceRinging || usesConnectedVideoView;
  const shellSurfaceClassName = usesConnectedVideoView
    ? "bg-black"
    : useStarbucksTheme
      ? STARBUCKS_CALL_SURFACE
      : useTelegramSolidShell
        ? telegramCallSurface
        : useOutgoingVoiceRingShell
          ? OUTGOING_VOICE_RING_SURFACE
          : undefined;
  /** 발신 영상·음성 벨 — 브라우저 내 `< 뒤로` 헤더 없이 safe-area 만 사용 */
  const showCallHeader =
    !(vm.direction === "incoming" && vm.phase === "ringing") &&
    !(vm.mode === "video" && vm.direction === "outgoing") &&
    !(isOutgoingVoiceRinging);

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
