import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAgoraJoinGuard,
  joinCommunityMessengerAgoraChannelOnce,
  resetAgoraJoinGuardForTests,
} from "@/lib/call/actions/agora-join-guard";
import { resetDibayCallFlowLogForTests } from "@/lib/call/logging/call-flow-log";

vi.mock("@/lib/community-messenger/call-provider/client", () => ({
  joinCommunityMessengerAgoraChannel: vi.fn(async () => undefined),
}));

describe("agora-join-guard", () => {
  beforeEach(() => {
    resetAgoraJoinGuardForTests();
    resetDibayCallFlowLogForTests();
    vi.clearAllMocks();
  });

  it("joins once per callId", async () => {
    const { joinCommunityMessengerAgoraChannel } = await import(
      "@/lib/community-messenger/call-provider/client"
    );
    const args = {
      client: {} as never,
      appId: "app",
      channelName: "ch",
      token: "tok",
      uid: "1",
    };
    const first = await joinCommunityMessengerAgoraChannelOnce("call-a", args);
    const second = await joinCommunityMessengerAgoraChannelOnce("call-a", args);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("duplicate");
    expect(joinCommunityMessengerAgoraChannel).toHaveBeenCalledTimes(1);
  });

  it("allows join after clear for consecutive calls", async () => {
    const args = {
      client: {} as never,
      appId: "app",
      channelName: "ch",
      token: "tok",
      uid: "1",
    };
    await joinCommunityMessengerAgoraChannelOnce("call-b", args);
    clearAgoraJoinGuard("call-b");
    const again = await joinCommunityMessengerAgoraChannelOnce("call-b", args);
    expect(again.ok).toBe(true);
  });
});
