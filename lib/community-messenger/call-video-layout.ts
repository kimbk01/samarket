import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSessionStatus,
} from "@/lib/community-messenger/types";

const TERMINAL: CommunityMessengerCallSessionStatus[] = ["ended", "cancelled", "rejected", "missed"];

export function isLiveCommunityMessengerCallSessionStatus(
  status: CommunityMessengerCallSessionStatus
): boolean {
  return status === "ringing" || status === "active";
}

/**
 * 풀스크린 로컬 영상
 * - ringing / active 조인 전
 * - 발신: 상대 영상(remoteJoined) 수신 전까지 본인 풀스크린 유지
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
}): boolean {
  if (args.sessionStatus && TERMINAL.includes(args.sessionStatus)) return false;
  return Boolean(args.videoCall && args.joined);
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
