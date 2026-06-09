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

  /** 음성 수신 벨만 텔레그램형 단색 셸 — 영상 수신 링은 발신과 동일 풀스크린(`ConnectedVideoView`) */
  const isIncomingRinging = vm.direction === "incoming" && vm.phase === "ringing" && vm.mode !== "video";
  const isOutgoingVoiceRinging = vm.direction === "outgoing" && vm.phase === "ringing" && vm.mode === "voice";
  const telegramCallSurface = "bg-[#8B5E2E]";
  const useTelegramSolidShell = isIncomingRinging;
  const useOutgoingVoiceRingShell = isOutgoingVoiceRinging;
  const shellSurfaceClassName = useTelegramSolidShell
    ? telegramCallSurface
    : useOutgoingVoiceRingShell
      ? OUTGOING_VOICE_RING_SURFACE
      : undefined;
  /**
   * 발신 영상은 항상 `ConnectedVideoView` 단일 레이어(중복 `CallBackground`·그라데이션 없음).
   * 원격 연결 후에도 첨부1처럼 카메라/영상 면이 끊기지 않게 한다.
   */
  const hideCallBackground =
    useTelegramSolidShell || isOutgoingVoiceRinging || (vm.mode === "video" && vm.direction === "outgoing");
  /** 발신 영상·음성 벨 — 브라우저 내 `< 뒤로` 헤더 없이 safe-area 만 사용 */
  const showCallHeader =
    !(vm.direction === "incoming" && vm.phase === "ringing" && vm.mode !== "video") &&
    !(vm.mode === "video" && vm.direction === "outgoing") &&
    !(isOutgoingVoiceRinging);

  return (
    <CallScreenShell
      variant={variant === "dock-top" ? "dock-top" : variant}
      surfaceClassName={shellSurfaceClassName}
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
          videoSlot={vm.mainVideoSlot}
          showVideo={vm.mode === "video" && Boolean(vm.mainVideoSlot)}
        />
      )}
      <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
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
  if (isTerminalPhase && !vm.suppressTerminalView) {
    return <EndedCallView vm={vm} />;
  }
  if (vm.direction === "incoming" && vm.phase === "ringing" && vm.mode !== "video") {
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
