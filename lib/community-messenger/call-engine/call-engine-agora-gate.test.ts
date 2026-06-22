import { beforeEach, describe, expect, it, vi } from "vitest";
import { joinCallEngineAgoraOnce } from "@/lib/community-messenger/call-engine/call-engine-agora-gate";
import { resetCallEngineLocksForTests } from "@/lib/community-messenger/call-engine/call-engine-locks";

const joinAgoraChannelSingleFlight = vi.fn();

vi.mock("@/lib/call/actions/agora-join-guard", () => ({
  joinAgoraChannelSingleFlight: (...args: unknown[]) => joinAgoraChannelSingleFlight(...args),
  clearAgoraJoinGuard: vi.fn(),
}));

describe("call-engine agora gate", () => {
  beforeEach(() => {
    resetCallEngineLocksForTests();
    joinAgoraChannelSingleFlight.mockReset();
  });

  it("joins once by lock", async () => {
    joinAgoraChannelSingleFlight.mockResolvedValue({ ok: true });
    const common = {
      client: {} as any,
      appId: "app",
      channelName: "ch",
      token: null,
      uid: "1",
      callKind: "voice" as const,
    };
    const first = await joinCallEngineAgoraOnce({ callId: "c1", ...common });
    const second = await joinCallEngineAgoraOnce({ callId: "c1", ...common });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("join_locked");
  });
});
