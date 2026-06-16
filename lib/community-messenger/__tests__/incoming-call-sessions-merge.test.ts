import { beforeEach, describe, expect, it } from "vitest";
import {
  INCOMING_INVITE_PREVIEW_KEEP_MS,
  mergeIncomingCallSessionsAfterFetch,
} from "@/lib/community-messenger/incoming-call-sessions-merge";
import { markCallConsumed, resetDibayCallSessionState } from "@/lib/community-messenger/incoming-call-state";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function session(
  partial: Partial<CommunityMessengerCallSession> & Pick<CommunityMessengerCallSession, "id" | "status">
): CommunityMessengerCallSession {
  const { id, status, ...rest } = partial;
  return {
    id,
    status,
    roomId: "r1",
    sessionMode: "direct",
    callKind: "voice",
    initiatorUserId: "caller",
    recipientUserId: "callee",
    peerUserId: "caller",
    peerLabel: "Caller",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    isMineInitiator: false,
    participants: [],
    ...rest,
  };
}

describe("mergeIncomingCallSessionsAfterFetch", () => {
  beforeEach(() => {
    resetDibayCallSessionState();
  });

  it("keeps invite_preview until server list includes session or TTL", () => {
    const preview = session({
      id: "s-preview",
      status: "ringing",
      source: "invite_preview",
      isPreview: true,
      recipientUserId: "callee",
    });
    const merged = mergeIncomingCallSessionsAfterFetch("callee", [], [preview], new Map(), new Map());
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("s-preview");
  });

  it("drops invite_preview when server confirms a different terminal state via id in list", () => {
    const preview = session({
      id: "s-preview",
      status: "ringing",
      source: "invite_preview",
      isPreview: true,
      recipientUserId: "callee",
    });
    const server = session({ id: "s-preview", status: "ringing", recipientUserId: "callee" });
    const merged = mergeIncomingCallSessionsAfterFetch("callee", [server], [preview], new Map(), new Map());
    expect(merged).toHaveLength(1);
    expect(merged[0]?.isPreview).toBeUndefined();
  });

  it("does not revive hard-cleared invite_preview", () => {
    const started = new Date(Date.now() - 1_000).toISOString();
    const preview = session({
      id: "s-preview",
      status: "ringing",
      source: "invite_preview",
      isPreview: true,
      recipientUserId: "callee",
      startedAt: started,
    });
    const hard = new Map([["s-preview", Date.now()]]);
    const merged = mergeIncomingCallSessionsAfterFetch("callee", [], [preview], new Map(), hard);
    expect(merged).toHaveLength(0);
  });

  it("does not revive consumed ringing sessions from poll merge", () => {
    markCallConsumed("s-consumed", "accepted");
    const ringing = session({
      id: "s-consumed",
      status: "ringing",
      recipientUserId: "callee",
    });
    const merged = mergeIncomingCallSessionsAfterFetch("callee", [ringing], [], new Map(), new Map());
    expect(merged).toHaveLength(0);
  });

  it("expires stale invite_preview beyond keep window", () => {
    const started = new Date(Date.now() - INCOMING_INVITE_PREVIEW_KEEP_MS - 1_000).toISOString();
    const preview = session({
      id: "s-preview",
      status: "ringing",
      source: "invite_preview",
      isPreview: true,
      recipientUserId: "callee",
      startedAt: started,
    });
    const merged = mergeIncomingCallSessionsAfterFetch("callee", [], [preview], new Map(), new Map());
    expect(merged).toHaveLength(0);
  });
});
