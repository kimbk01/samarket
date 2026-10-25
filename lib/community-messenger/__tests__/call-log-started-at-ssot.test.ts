import { beforeEach, describe, expect, it } from "vitest";
import { createCommunityMessengerCallLog } from "@/lib/community-messenger/service";

type DevState = {
  rooms: Array<{ id: string; lastMessageAt?: string }>;
  messages: unknown[];
  participants: Array<{ roomId: string; userId: string; unreadCount: number }>;
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

  /** C-N1 (1단계 문서 §14-9 · Owner 2026-10-25 승인): 통화 기록은 부재중만 안 읽은 수 — 상대만 +1, 멱등 */
  it("missed terminal stub increments only the non-actor participant and is idempotent", async () => {
    const dev = resetDevState();
    dev.participants = [
      { roomId: "room-1", userId: "caller", unreadCount: 0 },
      { roomId: "room-1", userId: "callee", unreadCount: 0 },
    ];
    const input = {
      userId: "caller",
      stubActorUserId: "caller",
      roomId: "room-1",
      sessionId: "session-missed",
      peerUserId: "callee",
      callKind: "voice" as const,
      status: "missed" as const,
      startedAt: "2026-06-09T09:30:00.000Z",
      replaceExistingStub: true,
    };

    await createCommunityMessengerCallLog(input);
    await createCommunityMessengerCallLog(input);

    expect(dev.messages).toHaveLength(1);
    expect(dev.participants.find((row) => row.userId === "callee")?.unreadCount).toBe(1);
    expect(dev.participants.find((row) => row.userId === "caller")?.unreadCount).toBe(0);
  });

  it("C-N1: rejected/ended/cancelled stubs do not change unread (no 「새 메시지」 banner after a call)", async () => {
    for (const status of ["rejected", "ended", "cancelled"] as const) {
      const dev = resetDevState();
      dev.participants = [
        { roomId: "room-1", userId: "caller", unreadCount: 0 },
        { roomId: "room-1", userId: "callee", unreadCount: 0 },
      ];
      await createCommunityMessengerCallLog({
        userId: "caller",
        stubActorUserId: "callee",
        roomId: "room-1",
        sessionId: `session-${status}`,
        peerUserId: "callee",
        callKind: "voice" as const,
        status,
        startedAt: "2026-06-09T09:30:00.000Z",
        replaceExistingStub: true,
      });
      expect(dev.messages).toHaveLength(1);
      expect(dev.participants.map((row) => row.unreadCount)).toEqual([0, 0]);
    }
  });
});
