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

/** 1:1 발신 영상 — ringing / active-pre-remote 구간 보조 PiP 미리보기 항상 */
export function isVideoPipFirstOutgoingPhase(args: VideoPipFirstPolicyArgs): boolean {
  if (args.callKind !== "video") return false;
  if (!args.isInitiator) return false;
  if (isTerminalSessionStatus(args.sessionStatus)) return false;
  if (args.sessionStatus === "ringing") return true;
  if (args.sessionStatus === "active" && !args.remoteJoined) return true;
  return false;
}

/** 발신 보조 PiP 슬롯 — 상대 영상이 메인일 때만 작은 self 타일 (본 화면 solo full 과 중복 금지) */
export function shouldShowOutgoingAuxPipPreviewSlot(args: {
  pipFirstOutgoing: boolean;
  localVideoReady: boolean;
  remoteJoined?: boolean;
}): boolean {
  if (!args.pipFirstOutgoing || args.localVideoReady) return false;
  return Boolean(args.remoteJoined);
}

/** 통화 풀스크린 본 화면 — in-call 보조 PiP 와 별개. 발신 pre-remote 는 본인 영상 full (hero·반반 금지) */
export function shouldUseInCallMainFullscreenVideo(args: {
  callKind: CommunityMessengerCallKind;
  sessionStatus: CommunityMessengerCallSessionStatus;
  joined: boolean;
  remoteJoined?: boolean;
  isInitiator?: boolean;
}): boolean {
  return shouldUseSoloLocalFullVideoLayout(args);
}

/** 백그라운드·Dock·OS PiP — 상대/본인 반반 분할 미리보기 */
export function shouldUseBackgroundCallSplitPreview(args: {
  callKind: CommunityMessengerCallKind;
  joined: boolean;
  localVideoReady: boolean;
  remoteJoined: boolean;
  remoteVideoReady: boolean;
}): boolean {
  if (args.callKind !== "video" || !args.joined) return false;
  return args.localVideoReady && args.remoteJoined && args.remoteVideoReady;
}

/** local=PiP slot — 발신 PiP-first 또는 callee active(수락·조인 포함) */
export function shouldUsePipFirstLocalSlot(args: VideoPipFirstPolicyArgs): boolean {
  if (args.callKind !== "video") return false;
  if (isTerminalSessionStatus(args.sessionStatus)) return false;
  if (isVideoPipFirstOutgoingPhase(args)) return true;
  return Boolean(!args.isInitiator && args.sessionStatus === "active");
}

/** 발신 PiP-first — pre-remote 전체 구간 shell 마운트 (joined 후 pre-remote 포함) */
export function shouldMountPipBeforeJoin(args: VideoPipFirstPolicyArgs): boolean {
  return isVideoPipFirstOutgoingPhase(args);
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

/** PiP-first 발신 pre-remote — 본 화면 solo full 이므로 보조 PiP 크롬 숨김 */
export function shouldShowPipFirstLocalPreviewChrome(args: {
  pipFirstOutgoing: boolean;
  pipShellMounted: boolean;
  preJoinReady?: boolean;
  localVideoReady?: boolean;
  remoteJoined?: boolean;
}): boolean {
  if (!args.pipFirstOutgoing || !args.pipShellMounted) return false;
  if (!args.remoteJoined) return false;
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
