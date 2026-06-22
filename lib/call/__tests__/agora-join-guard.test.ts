import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAgoraJoinGuard,
  hasAgoraJoinCompleted,
  joinCommunityMessengerAgoraChannelOnce,
  resetAgoraJoinGuardForTests,
} from "@/lib/call/actions/agora-join-guard";

vi.mock("@/lib/community-messenger/call-provider/client", () => ({
  joinCommunityMessengerAgoraChannel: vi.fn(async () => undefined),
}));

vi.mock("@/lib/call/logging/call-flow-log", () => ({
  logDibayCallFlow: vi.fn(),
}));

describe("agora join guard", () => {
  beforeEach(() => {
    resetAgoraJoinGuardForTests();
  });

  it("joins once per callId", async () => {
    const first = await joinCommunityMessengerAgoraChannelOnce("call-1", {
      client: {} as never,
      appId: "app",
      channelName: "ch",
      token: "tok",
      uid: "1",
    });
    expect(first).toEqual({ ok: true });
    expect(hasAgoraJoinCompleted("call-1")).toBe(true);

    const second = await joinCommunityMessengerAgoraChannelOnce("call-1", {
      client: {} as never,
      appId: "app",
      channelName: "ch",
      token: "tok",
      uid: "1",
    });
    expect(second).toEqual({ ok: false, reason: "duplicate" });
  });

  it("clearAgoraJoinGuard allows rejoin", async () => {
    await joinCommunityMessengerAgoraChannelOnce("call-2", {
      client: {} as never,
      appId: "app",
      channelName: "ch",
      token: "tok",
      uid: "1",
    });
    clearAgoraJoinGuard("call-2");
    expect(hasAgoraJoinCompleted("call-2")).toBe(false);
  });
});
