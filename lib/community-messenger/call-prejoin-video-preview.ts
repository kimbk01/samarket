import type { CommunityMessengerCallKind, CommunityMessengerCallSession, CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import { isCommunityMessengerTempCallSessionId } from "@/lib/community-messenger/call-session-navigation-seed";
import { peekPrimedCommunityMessengerDeviceStream } from "@/lib/community-messenger/call-permission";

const TERMINAL: CommunityMessengerCallSessionStatus[] = ["ended", "cancelled", "rejected", "missed"];

function isTerminal(status: CommunityMessengerCallSessionStatus): boolean {
  return TERMINAL.includes(status);
}

export function hasLiveCommunityMessengerVideoPreviewStream(stream: MediaStream | null): stream is MediaStream {
  if (!stream) return false;
  const tracks = stream.getVideoTracks();
  return tracks.length > 0 && tracks.some((t) => t.readyState === "live");
}

/**
 * tmp→real replace·첫 마운트(프라임 직후) 시 held HTML 미리보기 스트림 유지.
 * 다른 통화 sessionId 로의 전환은 보존하지 않는다.
 */
export function shouldPreserveHeldPreJoinVideoOnSessionRouteChange(args: {
  nextSessionId: string;
  prevSessionId: string | null;
  peekStream: MediaStream | null;
  heldStream: MediaStream | null;
}): boolean {
  const stream = args.peekStream ?? args.heldStream;
  if (!hasLiveCommunityMessengerVideoPreviewStream(stream)) return false;
  if (args.prevSessionId === args.nextSessionId) return false;
  if (!args.prevSessionId) return true;
  return (
    isCommunityMessengerTempCallSessionId(args.prevSessionId) &&
    !isCommunityMessengerTempCallSessionId(args.nextSessionId)
  );
}

/**
 * Agora 조인 전 HTML `<video>` 미리보기 — `ringing` 전용이 아니라 active·consume 이후까지 held 로 유지.
 */
export function resolvePreJoinVideoPreviewStream(args: {
  session: CommunityMessengerCallSession | null;
  localVideoPlaying: boolean;
  peekStream: MediaStream | null;
  heldStream: MediaStream | null;
}): MediaStream | null {
  const { session, localVideoPlaying, peekStream } = args;
  if (!session || session.callKind !== "video") return null;
  if (localVideoPlaying) return null;
  if (isTerminal(session.status)) return null;
  if (session.status !== "ringing" && session.status !== "active") return null;

  const held = peekStream ?? args.heldStream;
  if (!held) return null;
  const tracks = held.getVideoTracks();
  if (!tracks.length || tracks.every((t) => t.readyState !== "live")) return null;
  return held;
}

/** 발신 ringing — Agora 대신 HTML 카메라 미리보기만 쓴다 */
export function shouldShowOutgoingRingCameraPreview(args: {
  callKind: CommunityMessengerCallKind;
  sessionStatus: CommunityMessengerCallSessionStatus;
  isInitiator: boolean;
  /** held·resolvePreJoin 경로 — peek 만으로는 tmp→real 전환 직후 false 가 될 수 있음 */
  previewStream?: MediaStream | null;
}): boolean {
  if (args.callKind !== "video" || args.sessionStatus !== "ringing" || !args.isInitiator) {
    return false;
  }
  const stream = args.previewStream ?? peekPrimedCommunityMessengerDeviceStream("video");
  return hasLiveCommunityMessengerVideoPreviewStream(stream);
}

/** 수신 ringing — 보조 PiP 에 self HTML 미리보기 */
export function shouldShowIncomingRingCameraPreview(args: {
  callKind: CommunityMessengerCallKind;
  sessionStatus: CommunityMessengerCallSessionStatus;
  isInitiator: boolean;
  previewStream?: MediaStream | null;
}): boolean {
  if (args.callKind !== "video" || args.sessionStatus !== "ringing" || args.isInitiator) {
    return false;
  }
  const stream = args.previewStream ?? peekPrimedCommunityMessengerDeviceStream("video");
  return hasLiveCommunityMessengerVideoPreviewStream(stream);
}
