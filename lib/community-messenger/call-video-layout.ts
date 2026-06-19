import type { CallPipCorner } from "@/lib/community-messenger/call-pip-metrics";
import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSessionStatus,
} from "@/lib/community-messenger/types";
import { shouldShowOutgoingRingCameraPreview } from "@/lib/community-messenger/call-prejoin-video-preview";

const TERMINAL: CommunityMessengerCallSessionStatus[] = ["ended", "cancelled", "rejected", "missed"];

export type VideoPipFirstPolicyArgs = {
  callKind: CommunityMessengerCallKind;
  sessionStatus: CommunityMessengerCallSessionStatus;
  isInitiator?: boolean;
  joined?: boolean;
  remoteJoined?: boolean;
};

function isTerminalSessionStatus(status: CommunityMessengerCallSessionStatus): boolean {
  return TERMINAL.includes(status);
}

/** 1:1 발신 영상 — ringing / active-pre-remote 구간 PiP-first */
export function isVideoPipFirstOutgoingPhase(args: VideoPipFirstPolicyArgs): boolean {
  if (args.callKind !== "video") return false;
  if (!args.isInitiator) return false;
  if (isTerminalSessionStatus(args.sessionStatus)) return false;
  if (args.sessionStatus === "ringing") return true;
  if (args.sessionStatus === "active" && !args.remoteJoined) return true;
  return false;
}

/** local=PiP slot — 발신 PiP-first 또는 callee active(수락·조인 포함) */
export function shouldUsePipFirstLocalSlot(args: VideoPipFirstPolicyArgs): boolean {
  if (args.callKind !== "video") return false;
  if (isTerminalSessionStatus(args.sessionStatus)) return false;
  if (isVideoPipFirstOutgoingPhase(args)) return true;
  return Boolean(!args.isInitiator && args.sessionStatus === "active");
}

/** 발신 PiP-first — Agora join 전 PiP shell 마운트 */
export function shouldMountPipBeforeJoin(args: VideoPipFirstPolicyArgs): boolean {
  if (!isVideoPipFirstOutgoingPhase(args)) return false;
  return !args.joined;
}

export function shouldSuppressCameraPreparingOverlayForPipFirst(args: {
  pipFirstOutgoing: boolean;
  pipShellMounted?: boolean;
  preJoinReady?: boolean;
  heldPreJoin?: boolean;
  localVideoReady?: boolean;
}): boolean {
  /** PiP-first 발신 — 메인 슬롯에 「카메라 준비중」 오버레이 금지(보조 PiP 전용) */
  if (args.pipFirstOutgoing) return true;
  return false;
}

/** PiP-first 발신 — prejoin 또는 Agora local ready 시 PiP 크롬 표시 */
export function shouldShowPipFirstLocalPreviewChrome(args: {
  pipFirstOutgoing: boolean;
  pipShellMounted: boolean;
  preJoinReady?: boolean;
  localVideoReady?: boolean;
}): boolean {
  if (!args.pipFirstOutgoing || !args.pipShellMounted) return false;
  /** shell 마운트 즉시 PiP 타일 표시 — prejoin attach 전에도 빈 타일·곧 영상 */
  return true;
}

export function isLiveCommunityMessengerCallSessionStatus(
  status: CommunityMessengerCallSessionStatus
): boolean {
  return status === "ringing" || status === "active";
}

/**
 * 풀스크린 로컬 영상
 * - ringing / active 조인 전
 * - 발신: 상대 영상(remoteJoined) 수신 전까지 본인 풀스크린 유지
 * - PiP-first 발신 예외: isVideoPipFirstOutgoingPhase → false
 */
export function shouldUseSoloLocalFullVideoLayout(args: {
  callKind: CommunityMessengerCallKind;
  sessionStatus: CommunityMessengerCallSessionStatus;
  joined: boolean;
  remoteJoined?: boolean;
  isInitiator?: boolean;
}): boolean {
  if (args.callKind !== "video") return false;
  if (TERMINAL.includes(args.sessionStatus)) return false;
  if (
    shouldShowOutgoingRingCameraPreview({
      callKind: args.callKind,
      sessionStatus: args.sessionStatus,
      isInitiator: Boolean(args.isInitiator),
    })
  ) {
    return false;
  }
  if (
    isVideoPipFirstOutgoingPhase({
      callKind: args.callKind,
      sessionStatus: args.sessionStatus,
      isInitiator: Boolean(args.isInitiator),
      joined: args.joined,
      remoteJoined: args.remoteJoined,
    })
  ) {
    return false;
  }
  if (args.sessionStatus === "ringing") return true;
  if (args.isInitiator && !args.remoteJoined) return true;
  return args.sessionStatus === "active" && !args.joined;
}

/** 링·통화 중 HTML 미리보기용 프라임 스트림이 idle TTL 로 끊기지 않게 유지 */
export function shouldRetainPrimedDeviceStreamForVideoPreview(args: {
  callKind: CommunityMessengerCallKind;
  sessionStatus: CommunityMessengerCallSessionStatus;
}): boolean {
  return args.callKind === "video" && isLiveCommunityMessengerCallSessionStatus(args.sessionStatus);
}

/** PiP DOM·`smallVideoRef` — `localVideoReady` 전에도 마운트해 Agora bind deadlock 방지 */
export function shouldMountLocalVideoPipShell(args: {
  videoCall: boolean;
  sessionStatus?: CommunityMessengerCallSessionStatus;
  joined: boolean;
  isInitiator?: boolean;
  remoteJoined?: boolean;
}): boolean {
  if (args.sessionStatus && TERMINAL.includes(args.sessionStatus)) return false;
  if (args.videoCall && args.joined) return true;
  if (!args.videoCall || !args.sessionStatus) return false;
  return shouldMountPipBeforeJoin({
    callKind: "video",
    sessionStatus: args.sessionStatus,
    isInitiator: Boolean(args.isInitiator),
    joined: args.joined,
    remoteJoined: args.remoteJoined,
  });
}

/** PiP 크롬 가시성 — 트랙 play 완료 후 opacity/콘텐츠 표시 (드래그는 별도 허용) */
export function shouldShowLocalVideoPipChrome(args: {
  videoCall: boolean;
  sessionStatus?: CommunityMessengerCallSessionStatus;
  joined: boolean;
  localVideoReady: boolean;
}): boolean {
  if (args.sessionStatus && TERMINAL.includes(args.sessionStatus)) return false;
  return Boolean(args.videoCall && args.joined && args.localVideoReady);
}

/** PiP 드래그·스냅 — 영상 ready 전에도 shell 이 마운트되면 허용 */
export function shouldAllowPipPointerInteraction(args: {
  pipShellMounted: boolean;
  hasPipGestureBindings: boolean;
}): boolean {
  return Boolean(args.pipShellMounted && args.hasPipGestureBindings);
}

/** 카톡/텔레그램식 통화 오버레이 배경 모드 — 렌더링 전용 */
export type CallOverlayBackdropMode = "peer-blur-dim" | "remote-video-dim" | "voice-gradient";

export type ResolveCallOverlayBackdropModeArgs = {
  mode: "voice" | "video";
  direction: "outgoing" | "incoming";
  phase: string;
  showRemoteVideo?: boolean;
  pipFirstOutgoingMainPlaceholder?: boolean;
};

/** 통화 오버레이 배경 — remote 영상 연결 후에도 얇은 dim 유지 */
export function resolveCallOverlayBackdropMode(
  args: ResolveCallOverlayBackdropModeArgs
): CallOverlayBackdropMode {
  if (args.mode === "voice") return "voice-gradient";
  if (args.showRemoteVideo) return "remote-video-dim";
  return "peer-blur-dim";
}

/** CallScreenShell — 불투명 black/green 풀스크린 대신 translucent overlay */
export function shouldUseTranslucentCallShell(_args?: {
  variant?: "overlay" | "page" | "dock-top";
}): boolean {
  return (_args?.variant ?? "overlay") !== "dock-top";
}

/** translucent overlay shell surface class */
export const TRANSLUCENT_CALL_SHELL_SURFACE =
  "bg-black/35 backdrop-blur-[2px] supports-[backdrop-filter]:backdrop-blur-md";

/** PiP-first·placeholder 구간 — mainVideoSlot 불투명 fill 금지 */
export function shouldUseTransparentMainVideoSlotRoot(args: {
  videoCall: boolean;
  showRemoteVideo?: boolean;
  pipFirstOutgoingMainPlaceholder?: boolean;
}): boolean {
  if (!args.videoCall) return false;
  if (args.showRemoteVideo) return false;
  return Boolean(args.pipFirstOutgoingMainPlaceholder);
}

/** 카톡/텔레그램식 — 내부 PiP 기본 우상단(connected·발신 영상) */
export function shouldDefaultPipCornerTop(args: {
  videoCall: boolean;
  pipShellMounted?: boolean;
}): boolean {
  return Boolean(args.videoCall && args.pipShellMounted);
}

export function resolveCallDefaultPipCorner(args: {
  videoCall: boolean;
  pipShellMounted?: boolean;
}): CallPipCorner {
  return shouldDefaultPipCornerTop(args) ? "topRight" : "bottomRight";
}
