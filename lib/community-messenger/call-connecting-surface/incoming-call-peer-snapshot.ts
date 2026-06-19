"use client";

import type { CommunityMessengerCallKind, CommunityMessengerCallSession } from "@/lib/community-messenger/types";
import { incomingCallPeerNicknameLabel } from "@/lib/users/user-label";

const KEY = "samarket.cm.incoming_call_peer_snapshot.v1";
const TTL_MS = 120_000;

export type IncomingCallPeerSnapshot = {
  sessionId: string;
  peerLabel: string;
  peerAvatarUrl: string | null;
  callKind: CommunityMessengerCallKind;
  at: number;
  source?: string;
};

export function writeIncomingCallPeerSnapshot(input: {
  sessionId: string;
  peerLabel?: string | null;
  peerAvatarUrl?: string | null;
  callKind?: CommunityMessengerCallKind | string | null;
  source?: string;
}): void {
  if (typeof window === "undefined") return;
  const sessionId = input.sessionId.trim();
  if (!sessionId) return;
  const peerLabel = incomingCallPeerNicknameLabel(input.peerLabel) ?? input.peerLabel?.trim() ?? "";
  if (!peerLabel) return;
  const callKind =
    input.callKind === "video" || input.callKind === "voice" ? input.callKind : "voice";
  const peerAvatarUrl = input.peerAvatarUrl?.trim() || null;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        sessionId,
        peerLabel,
        peerAvatarUrl,
        callKind,
        at: Date.now(),
        source: input.source ?? "unknown",
      } satisfies IncomingCallPeerSnapshot)
    );
  } catch {
    /* quota */
  }
}

export function writeIncomingCallPeerSnapshotFromSession(
  session: CommunityMessengerCallSession,
  source = "session"
): void {
  if (session.isMineInitiator) return;
  writeIncomingCallPeerSnapshot({
    sessionId: session.id,
    peerLabel: session.peerLabel,
    peerAvatarUrl: session.peerAvatarUrl,
    callKind: session.callKind,
    source,
  });
}

export function readIncomingCallPeerSnapshot(
  sessionId: string,
  now = Date.now()
): IncomingCallPeerSnapshot | null {
  if (typeof window === "undefined") return null;
  const sid = sessionId.trim();
  if (!sid) return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as IncomingCallPeerSnapshot;
    if (!o || o.sessionId !== sid) return null;
    if (typeof o.at === "number" && now - o.at > TTL_MS) {
      clearIncomingCallPeerSnapshot(sid);
      return null;
    }
    const peerLabel = incomingCallPeerNicknameLabel(o.peerLabel) ?? o.peerLabel?.trim() ?? "";
    if (!peerLabel) return null;
    const callKind = o.callKind === "video" ? "video" : "voice";
    return {
      sessionId: sid,
      peerLabel,
      peerAvatarUrl: o.peerAvatarUrl ?? null,
      callKind,
      at: typeof o.at === "number" ? o.at : now,
      source: o.source,
    };
  } catch {
    return null;
  }
}

export function clearIncomingCallPeerSnapshot(sessionId?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (!sessionId?.trim()) {
      window.sessionStorage.removeItem(KEY);
      return;
    }
    const sid = sessionId.trim();
    const current = readIncomingCallPeerSnapshot(sid);
    if (current?.sessionId === sid) {
      window.sessionStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
}
