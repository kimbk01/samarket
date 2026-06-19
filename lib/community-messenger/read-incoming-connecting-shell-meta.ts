"use client";

import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { peekCommunityMessengerCallNavigationSeed } from "@/lib/community-messenger/call-session-navigation-seed";

export type IncomingConnectingShellMeta = {
  callId: string;
  peerLabel: string;
  peerAvatarUrl: string | null;
  callKind: CommunityMessengerCallKind;
};

/** navigation seed — consume 없이 peer 메타만 (CallClient hydrate용 시드 보존) */
export function readIncomingConnectingShellMeta(
  sessionId: string,
  fallbackLabel: string
): IncomingConnectingShellMeta {
  const sid = sessionId.trim();
  const session: CommunityMessengerCallSession | null = sid
    ? peekCommunityMessengerCallNavigationSeed(sid)
    : null;
  const callKind =
    session?.callKind === "video" || session?.callKind === "voice" ? session.callKind : "voice";
  const peerLabel = session?.peerLabel?.trim() || fallbackLabel;
  const peerAvatarUrl = session?.peerAvatarUrl ?? null;
  return { callId: sid, peerLabel, peerAvatarUrl, callKind };
}
