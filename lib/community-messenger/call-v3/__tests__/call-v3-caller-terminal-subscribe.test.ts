import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  remoteTerminal: vi.fn(),
}));

const subscribeMocks = vi.hoisted(() => ({
  onHangup: null as ((payload: Record<string, unknown>) => void) | null,
  channel: { id: "ch-1" },
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-actions", () => ({
  callV3HandleRemoteTerminal: actionMocks.remoteTerminal,
}));

vi.mock("@/lib/community-messenger/call-v3/call-v3-route", () => ({
  readCallV3ExitRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({}),
}));

vi.mock("@/lib/community-messenger/call-invite-realtime-broadcast", () => ({
  subscribeCommunityMessengerCallInviteBroadcast: (
    _sb: unknown,
    _userId: string,
    handlers: { onHangup: (payload: Record<string, unknown>) => void }
  ) => {
    subscribeMocks.onHangup = handlers.onHangup;
    return subscribeMocks.channel;
  },
}));

import { startCallV3CallerTerminalBroadcastSubscribe } from "@/lib/community-messenger/call-v3/call-v3-caller-terminal-subscribe";
import { useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

describe("call-v3-caller-terminal-subscribe", () => {
  beforeEach(() => {
    useCallV3Store.getState().resetToIdle();
    actionMocks.remoteTerminal.mockClear();
    subscribeMocks.onHangup = null;
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("handles hangup broadcast for outgoing ringing caller", () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
      canStartNewCall: false,
    });

    startCallV3CallerTerminalBroadcastSubscribe("user-a");
    expect(subscribeMocks.onHangup).toBeTypeOf("function");

    subscribeMocks.onHangup?.({ sessionId: "call-1", status: "rejected" });

    expect(actionMocks.remoteTerminal).toHaveBeenCalledWith(
      "call-1",
      "rejected",
      expect.objectContaining({ replace: expect.any(Function) })
    );
  });

  it("ignores hangup for unrelated call", () => {
    useCallV3Store.setState({
      phase: "outgoing_ringing",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: "2026-06-23T00:00:00.000Z",
      },
    });

    startCallV3CallerTerminalBroadcastSubscribe("user-a");
    subscribeMocks.onHangup?.({ sessionId: "call-other", status: "rejected" });

    expect(actionMocks.remoteTerminal).not.toHaveBeenCalled();
  });
});
