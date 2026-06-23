import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchSessionForPoll: vi.fn(),
  subscribeInvite: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSessionForCallerPoll: (...args: unknown[]) => mocks.fetchSessionForPoll(...args),
}));

vi.mock("@/lib/community-messenger/call-invite-realtime-broadcast", () => ({
  subscribeCommunityMessengerCallInviteBroadcast: (...args: unknown[]) => mocks.subscribeInvite(...args),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({ removeChannel: mocks.removeChannel }),
}));

import {
  registerCallV4ConnectedTerminalHandler,
  resetCallV4ConnectedTerminalWatchForTests,
  startCallV4ConnectedTerminalWatch,
  startCallV4TerminalRealtimeWatch,
  triggerCallV4RemoteTerminalCheckFromAgora,
} from "@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

function seedConnectedCall(callId = "call-watch") {
  useCallV4Store.getState().resetToIdle();
  useCallV4Store.getState().setIdentity({
    callId,
    roomId: "room-1",
    callerUserId: "u-a",
    calleeUserId: "u-b",
    direction: "incoming",
    mediaType: "audio",
    createdAt: new Date().toISOString(),
  });
  useCallV4Store.setState({ phase: "connected", connectedAt: Date.now() });
}

describe("call-v4 connected terminal watch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.fetchSessionForPoll.mockReset();
    mocks.subscribeInvite.mockReset();
    mocks.removeChannel.mockReset();
    resetCallV4ConnectedTerminalWatchForTests();
    seedConnectedCall();
  });

  afterEach(() => {
    resetCallV4ConnectedTerminalWatchForTests();
    vi.useRealTimers();
  });

  it("poll confirms terminal status and calls registered handler", async () => {
    const handler = vi.fn();
    registerCallV4ConnectedTerminalHandler(handler);
    mocks.fetchSessionForPoll.mockResolvedValue({
      session: { status: "ended" },
      httpStatus: 200,
      notFound: false,
    });
    startCallV4ConnectedTerminalWatch("call-watch");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(handler).toHaveBeenCalledWith("call-watch", "ended", "poll");
  });

  it("agora remote-left trigger verifies server terminal before finalize", async () => {
    const handler = vi.fn();
    registerCallV4ConnectedTerminalHandler(handler);
    mocks.fetchSessionForPoll.mockResolvedValue({
      session: { status: "cancelled" },
      httpStatus: 200,
      notFound: false,
    });
    startCallV4ConnectedTerminalWatch("call-watch");
    triggerCallV4RemoteTerminalCheckFromAgora("call-watch", 7);
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith("call-watch", "cancelled", "agora");
  });

  it("realtime subscription routes hangup payload into terminal confirmation", async () => {
    const handler = vi.fn();
    registerCallV4ConnectedTerminalHandler(handler);
    mocks.fetchSessionForPoll.mockResolvedValue({
      session: { status: "rejected" },
      httpStatus: 200,
      notFound: false,
    });
    const channel = { id: "ch" };
    mocks.subscribeInvite.mockImplementation((_sb, _userId, handlers) => {
      handlers.onHangup({ sessionId: "call-watch", status: "rejected" });
      return channel;
    });
    startCallV4ConnectedTerminalWatch("call-watch");
    const cleanup = startCallV4TerminalRealtimeWatch("u-b");
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).toHaveBeenCalledWith("call-watch", "rejected", "realtime");
    cleanup();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("ignores non-current call terminal triggers", async () => {
    const handler = vi.fn();
    registerCallV4ConnectedTerminalHandler(handler);
    mocks.fetchSessionForPoll.mockResolvedValue({
      session: { status: "ended" },
      httpStatus: 200,
      notFound: false,
    });
    startCallV4ConnectedTerminalWatch("call-watch");
    triggerCallV4RemoteTerminalCheckFromAgora("other-call", 8);
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });
});

