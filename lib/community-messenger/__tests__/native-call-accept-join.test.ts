import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitForActiveCallSessionAfterNativeAccept } from "@/lib/community-messenger/native-call-accept-join";
import type { CommunityMessengerCallSession } from "@/lib/community-messenger/types";

function session(status: CommunityMessengerCallSession["status"]): CommunityMessengerCallSession {
  return {
    id: "sess-1",
    status,
    callKind: "video",
    sessionMode: "direct",
    isMineInitiator: false,
    roomId: "room-1",
    initiatorUserId: "u1",
    recipientUserId: "u2",
    peerUserId: "u1",
    peerLabel: "Peer",
    participants: [],
    startedAt: null,
    answeredAt: null,
    endedAt: null,
  } as unknown as CommunityMessengerCallSession;
}

describe("waitForActiveCallSessionAfterNativeAccept", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns active session after refresh catches up", async () => {
    let current: CommunityMessengerCallSession | null = session("ringing");
    const refreshSession = vi.fn(async () => {
      current = session("active");
      return current;
    });
    const promise = waitForActiveCallSessionAfterNativeAccept({
      refreshSession,
      readSession: () => current,
      maxAttempts: 3,
      delayMs: 100,
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result?.status).toBe("active");
    expect(refreshSession).toHaveBeenCalled();
  });

  it("returns null when session never becomes active", async () => {
    const current = session("ringing");
    const refreshSession = vi.fn(async () => current);
    const promise = waitForActiveCallSessionAfterNativeAccept({
      refreshSession,
      readSession: () => current,
      maxAttempts: 2,
      delayMs: 50,
    });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBeNull();
  });
});
