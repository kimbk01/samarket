"use client";

import type {
  CommunityMessengerCallKind,
  CommunityMessengerCallSession,
} from "@/lib/community-messenger/types";
import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";

const KEY = "samarket.cm.call_accept_hydrate_peer.v1";
const TTL_MS = 120_000;

export type CallAcceptHydratePeer = {
  sessionId: string;
  peerLabel: string;
  peerAvatarUrl: string | null;
  callKind: CommunityMessengerCallKind;
  roomId?: string | null;
  peerUserId?: string | null;
  at: number;
  source?: string;
};

export function writeCallAcceptHydratePeer(input: {
  sessionId: string;
  peerLabel?: string | null;
  peerAvatarUrl?: string | null;
  callKind?: CommunityMessengerCallKind | string | null;
  roomId?: string | null;
  peerUserId?: string | null;
  source?: string;
}): void {
  if (typeof window === "undefined") return;
  const sessionId = input.sessionId.trim();
  if (!sessionId) return;
  const peerLabel = incomingCallPeerNicknameLabel(input.peerLabel) ?? input.peerLabel?.trim() ?? "";
  if (!peerLabel) return;
  const callKind =
    input.callKind === "video" || input.callKind === "voice" ? input.callKind : "voice";
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        sessionId,
        peerLabel,
        peerAvatarUrl: input.peerAvatarUrl?.trim() || null,
        callKind,
        roomId: input.roomId?.trim() || null,
        peerUserId: input.peerUserId?.trim() || null,
        at: Date.now(),
        source: input.source ?? "unknown",
      } satisfies CallAcceptHydratePeer)
    );
  } catch {
    /* quota */
  }
}

export function writeCallAcceptHydratePeerFromSession(
  session: CommunityMessengerCallSession,
  source = "session"
): void {
  if (session.isMineInitiator) return;
  writeCallAcceptHydratePeer({
    sessionId: session.id,
    peerLabel: session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl,
    callKind: session.callKind,
    roomId: session.roomId,
    peerUserId: session.peerUserId,
    source,
  });
}

export function readCallAcceptHydratePeer(
  sessionId: string,
  now = Date.now()
): CallAcceptHydratePeer | null {
  if (typeof window === "undefined") return null;
  const sid = sessionId.trim();
  if (!sid) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as CallAcceptHydratePeer;
    if (!o || o.sessionId !== sid) return null;
    if (typeof o.at === "number" && now - o.at > TTL_MS) {
      clearCallAcceptHydratePeer(sid);
      return null;
    }
    const peerLabel = incomingCallPeerNicknameLabel(o.peerLabel) ?? o.peerLabel?.trim() ?? "";
    if (!peerLabel) return null;
    return {
      sessionId: sid,
      peerLabel,
      peerAvatarUrl: o.peerAvatarUrl ?? null,
      callKind: o.callKind === "video" ? "video" : "voice",
      roomId: o.roomId ?? null,
      peerUserId: o.peerUserId ?? null,
      at: typeof o.at === "number" ? o.at : now,
      source: o.source,
    };
  } catch {
    return null;
  }
}

export function clearCallAcceptHydratePeer(sessionId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!sessionId?.trim()) {
      window.sessionStorage.removeItem(KEY);
      return;
    }
    const current = readCallAcceptHydratePeer(sessionId);
    if (current?.sessionId === sessionId.trim()) {
      window.sessionStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}

/** nativeAccept=1 — navigation seed 없이 진입할 때 active callee 세션 최소 스텁 */
export function buildCalleeAcceptActiveSessionSeed(
  peer: CallAcceptHydratePeer
): CommunityMessengerCallSession {
  const now = new Date().toISOString();
  return {
    id: peer.sessionId,
    roomId: peer.roomId?.trim() ?? "",
    sessionMode: "direct",
    initiatorUserId: peer.peerUserId?.trim() ?? "",
    recipientUserId: null,
    peerUserId: peer.peerUserId?.trim() || null,
    peerLabel: peer.peerLabel,
    peerAvatarUrl: peer.peerAvatarUrl,
    callKind: peer.callKind,
    status: "active",
    startedAt: now,
    answeredAt: now,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
    source: "native_accept_hydrate_seed",
  };
}
