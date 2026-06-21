import { describe, expect, it } from "vitest";
import {
  isIncomingCallerDisplayFallback,
  readIncomingCallerDisplaySeed,
  resolveDirectIncomingCallerUserId,
} from "@/lib/community-messenger/incoming-call/incoming-caller-ssot";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function session(partial: Partial<CommunityMessengerCallSession>): CommunityMessengerCallSession {
  return {
    id: "s1",
    roomId: "room-1",
    sessionMode: "direct",
    initiatorUserId: "caller-uuid",
    recipientUserId: "callee-uuid",
    peerUserId: "wrong-peer",
    peerLabel: "회원 abc123",
    callKind: "voice",
    status: "ringing",
    startedAt: new Date().toISOString(),
    answeredAt: null,
    endedAt: null,
    isMineInitiator: false,
    participants: [],
    ...partial,
  };
}

describe("incoming-caller-ssot", () => {
  it("resolveDirectIncomingCallerUserId returns initiator for callee viewer", () => {
    const s = session({ id: "s1" });
    expect(resolveDirectIncomingCallerUserId(s, "callee-uuid")).toBe("caller-uuid");
  });

  it("readIncomingCallerDisplaySeed rejects fallback peerLabel", () => {
    const s = session({ id: "s1", peerUserId: "caller-uuid", peerLabel: "회원 abc123" });
    expect(readIncomingCallerDisplaySeed(s, "caller-uuid")).toBeNull();
  });

  it("readIncomingCallerDisplaySeed accepts rich label when peerUserId matches caller", () => {
    const s = session({
      id: "s1",
      peerUserId: "caller-uuid",
      peerLabel: "Alice",
      peerAvatarUrl: "/a.jpg",
      peerPublicId: "alice01",
    });
    expect(readIncomingCallerDisplaySeed(s, "caller-uuid")).toEqual({
      label: "Alice",
      avatarUrl: "/a.jpg",
      publicId: "alice01",
    });
  });

  it("isIncomingCallerDisplayFallback detects member slug labels", () => {
    expect(isIncomingCallerDisplayFallback("회원 abc123", "abc12345-0000-0000-0000-000000000000")).toBe(true);
    expect(isIncomingCallerDisplayFallback("Alice", "caller-uuid")).toBe(false);
  });
});
