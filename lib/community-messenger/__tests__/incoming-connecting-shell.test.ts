/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  peekCommunityMessengerCallNavigationSeed,
  primeCommunityMessengerCallNavigationSeed,
} from "@/lib/community-messenger/call-session-navigation-seed";
import { readIncomingConnectingShellMeta } from "@/lib/community-messenger/read-incoming-connecting-shell-meta";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

const SEED_KEY = "samarket.cm.call_session_seed.v1";

function buildSession(
  partial: Partial<CommunityMessengerCallSession> & Pick<CommunityMessengerCallSession, "id">
): CommunityMessengerCallSession {
  const { id, ...rest } = partial;
  return {
    id,
    status: "ringing",
    roomId: "room-1",
    sessionMode: "direct",
    callKind: "video",
    initiatorUserId: "caller",
    recipientUserId: "callee",
    peerUserId: "caller",
    peerLabel: "Alice",
    peerAvatarUrl: "https://example.com/a.png",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    endedReason: null,
    isMineInitiator: false,
    participants: [],
    ...rest,
  };
}

describe("readIncomingConnectingShellMeta", () => {
  afterEach(() => {
    window.sessionStorage.removeItem(SEED_KEY);
  });

  it("reads peer meta from navigation seed without consuming", () => {
    const session = buildSession({ id: "sess-1" });
    primeCommunityMessengerCallNavigationSeed("sess-1", session);

    const meta = readIncomingConnectingShellMeta("sess-1", "통화");
    expect(meta).toEqual({
      callId: "sess-1",
      peerLabel: "Alice",
      peerAvatarUrl: "https://example.com/a.png",
      callKind: "video",
    });

    expect(peekCommunityMessengerCallNavigationSeed("sess-1")).toEqual(session);
    expect(window.sessionStorage.getItem(SEED_KEY)).not.toBeNull();
  });

  it("falls back when seed is missing or mismatched", () => {
    const meta = readIncomingConnectingShellMeta("sess-2", "통화 상대");
    expect(meta).toEqual({
      callId: "sess-2",
      peerLabel: "통화 상대",
      peerAvatarUrl: null,
      callKind: "voice",
    });

    primeCommunityMessengerCallNavigationSeed(
      "other",
      buildSession({ id: "other", peerLabel: "Bob" })
    );
    const mismatched = readIncomingConnectingShellMeta("sess-2", "통화");
    expect(mismatched.peerLabel).toBe("통화");
    expect(mismatched.callKind).toBe("voice");
  });
});

describe("peekCommunityMessengerCallNavigationSeed", () => {
  afterEach(() => {
    window.sessionStorage.removeItem(SEED_KEY);
  });

  it("returns seeded session for matching sessionId", () => {
    const session = buildSession({ id: "sess-v", callKind: "voice", peerLabel: "Callee" });
    primeCommunityMessengerCallNavigationSeed("sess-v", session);
    expect(peekCommunityMessengerCallNavigationSeed("sess-v")).toEqual(session);
  });
});
