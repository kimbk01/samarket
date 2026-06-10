import type { CommunityMessengerCallSession, CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";
import { isCommunityMessengerTempCallSessionId } from "@/lib/community-messenger/call-session-navigation-seed";

const TERMINAL: CommunityMessengerCallSessionStatus[] = ["ended", "cancelled", "rejected", "missed"];

function isTerminal(status: CommunityMessengerCallSessionStatus): boolean {
  return TERMINAL.includes(status);
}

export function hasLiveCommunityMessengerVideoPreviewStream(stream: MediaStream | null): boolean {
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
