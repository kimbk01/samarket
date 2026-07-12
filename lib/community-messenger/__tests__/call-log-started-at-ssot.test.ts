import { beforeEach, describe, expect, it } from "vitest";
import { createCommunityMessengerCallLog } from "@/lib/community-messenger/service";

type DevState = {
  rooms: Array<{ id: string; lastMessageAt?: string }>;
  messages: unknown[];
  participants: unknown[];
  calls: Array<{ sessionId: string | null; startedAt: string }>;
  callSessions: Array<{ id: string; startedAt: string }>;
};

function resetDevState(): DevState {
  const state: DevState = {
    rooms: [{ id: "room-1" }],
    messages: [],
    participants: [],
    calls: [],
    callSessions: [{ id: "session-1", startedAt: "2026-06-09T09:30:00.000Z" }],
  };
  (globalThis as unknown as { __samarketCommunityMessengerState?: DevState }).__samarketCommunityMessengerState =
    state;
  return state;
}

describe("createCommunityMessengerCallLog started_at SSOT", () => {
  beforeEach(() => {
    resetDevState();
  });

  it("TEST 6: call_log.started_at uses session.started_at when provided", async () => {
    const sessionStartedAt = "2026-06-09T09:30:00.000Z";
    const result = await createCommunityMessengerCallLog({
      userId: "user-1",
      roomId: "room-1",
      sessionId: "session-1",
      peerUserId: "user-2",
      callKind: "voice",
      status: "missed",
      startedAt: sessionStartedAt,
      replaceExistingStub: true,
    });
    expect(result.ok).toBe(true);
    const dev = (globalThis as unknown as { __samarketCommunityMessengerState: DevState })
      .__samarketCommunityMessengerState;
    expect(dev.calls[0]?.startedAt).toBe(sessionStartedAt);
  });
});
