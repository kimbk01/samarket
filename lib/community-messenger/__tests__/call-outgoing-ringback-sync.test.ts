import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/community-messenger/call-outgoing-ringback-controller", () => ({
  startOutgoingRingback: vi.fn(),
  stopOutgoingRingback: vi.fn(),
  stopAllOutgoingRingback: vi.fn(),
}));

import {
  startOutgoingRingback,
  stopOutgoingRingback,
} from "@/lib/community-messenger/call-outgoing-ringback-controller";
import {
  stopOutgoingRingbackForSessionId,
  syncOutgoingRingbackFromCallSession,
} from "@/lib/community-messenger/call-outgoing-ringback-sync";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function ringingOutgoingSession(id = "session-a"): CommunityMessengerCallSession {
  return {
    id,
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "u1",
    recipientUserId: "u2",
    peerUserId: "u2",
    peerLabel: "Peer",
    peerAvatarUrl: null,
    callKind: "voice",
    status: "ringing",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    isMineInitiator: true,
    participants: [],
  };
}

describe("call-outgoing-ringback-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts ringback for outgoing ringing before join", () => {
    syncOutgoingRingbackFromCallSession({
      session: ringingOutgoingSession(),
      joined: false,
      remoteJoined: false,
      source: "test",
    });
    expect(startOutgoingRingback).toHaveBeenCalledWith({
      callId: "session-a",
      kind: "voice",
      source: "test",
    });
    expect(stopOutgoingRingback).not.toHaveBeenCalled();
  });

  it("skipStart does not start or stop (primed elsewhere)", () => {
    syncOutgoingRingbackFromCallSession({
      session: ringingOutgoingSession(),
      joined: false,
      remoteJoined: false,
      source: "test",
      skipStart: true,
    });
    expect(startOutgoingRingback).not.toHaveBeenCalled();
    expect(stopOutgoingRingback).not.toHaveBeenCalled();
  });

  it("stops ringback when no longer ringing-wait", () => {
    syncOutgoingRingbackFromCallSession({
      session: { ...ringingOutgoingSession(), status: "active" },
      joined: false,
      remoteJoined: false,
      source: "test",
    });
    expect(startOutgoingRingback).not.toHaveBeenCalled();
    expect(stopOutgoingRingback).toHaveBeenCalledWith("session-a", "test");
  });

  it("does not start for callee", () => {
    syncOutgoingRingbackFromCallSession({
      session: { ...ringingOutgoingSession(), isMineInitiator: false },
      joined: false,
      remoteJoined: false,
      source: "test",
    });
    expect(startOutgoingRingback).not.toHaveBeenCalled();
    expect(stopOutgoingRingback).not.toHaveBeenCalled();
  });

  it("stopOutgoingRingbackForSessionId routes empty id to stopAll", async () => {
    const { stopAllOutgoingRingback } = await import(
      "@/lib/community-messenger/call-outgoing-ringback-controller"
    );
    stopOutgoingRingbackForSessionId("", "cleanup");
    expect(stopAllOutgoingRingback).toHaveBeenCalledWith("cleanup");
  });
});
