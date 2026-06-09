import type { CommunityMessengerCallSession, CommunityMessengerCallSessionStatus } from "@/lib/community-messenger/types";

const TERMINAL: CommunityMessengerCallSessionStatus[] = ["ended", "cancelled", "rejected", "missed"];

function isTerminal(status: CommunityMessengerCallSessionStatus): boolean {
  return TERMINAL.includes(status);
}

/**
 * Agora 조인 전 HTML `<video>` 미리보기 — `ringing` 전용이 아니라 active·consume 이후까지 held 로 유지.
 */
export function resolvePreJoinVideoPreviewStream(args: {
  session: CommunityMessengerCallSession | null;
  localVideoReady: boolean;
  peekStream: MediaStream | null;
  heldStream: MediaStream | null;
}): MediaStream | null {
  const { session, localVideoReady, peekStream } = args;
  if (!session || session.callKind !== "video") return null;
  if (localVideoReady) return null;
  if (isTerminal(session.status)) return null;
  if (session.status !== "ringing" && session.status !== "active") return null;

  const held = peekStream ?? args.heldStream;
  if (!held) return null;
  const tracks = held.getVideoTracks();
  if (!tracks.length || tracks.every((t) => t.readyState !== "live")) return null;
  return held;
}
