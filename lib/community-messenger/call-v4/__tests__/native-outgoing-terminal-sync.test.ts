import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchSessionForCallerPoll: vi.fn(),
  isNativeOwned: vi.fn(async () => true),
}));

const actionsMocks = vi.hoisted(() => ({
  handleRemoteTerminal: vi.fn(async () => undefined),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSessionForCallerPoll: apiMocks.fetchSessionForCallerPoll,
}));

vi.mock("@/lib/call/native/native-outgoing-bridge", () => ({
  isNativeEstablishmentOwned: apiMocks.isNativeOwned,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-actions", () => ({
  callV4HandleRemoteTerminal: actionsMocks.handleRemoteTerminal,
}));

import {
  resetNativeOutgoingTerminalSyncForTests,
  startNativeOutgoingTerminalSync,
  stopNativeOutgoingTerminalSync,
} from "@/lib/community-messenger/call-v4/native-outgoing-terminal-sync";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("native-outgoing-terminal-sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetNativeOutgoingTerminalSyncForTests();
    useCallV4Store.getState().resetToIdle();
    apiMocks.fetchSessionForCallerPoll.mockReset();
    apiMocks.isNativeOwned.mockReset();
    apiMocks.isNativeOwned.mockResolvedValue(true);
    actionsMocks.handleRemoteTerminal.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetNativeOutgoingTerminalSyncForTests();
    vi.useRealTimers();
  });

  it("calls callV4HandleRemoteTerminal when server session is terminal", async () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      identity: {
        callId: "call-cancel-1",
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
        peerLabel: "Peer",
        peerAvatarUrl: null,
      },
    });

    apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
      session: {
        id: "call-cancel-1",
        status: "cancelled",
      },
      httpStatus: 200,
      notFound: false,
    });

    startNativeOutgoingTerminalSync("call-cancel-1", { push: vi.fn() });
    await vi.runOnlyPendingTimersAsync();

    expect(actionsMocks.handleRemoteTerminal).toHaveBeenCalledWith(
      "call-cancel-1",
      "cancelled",
      expect.objectContaining({ push: expect.any(Function) }),
      "outgoing_terminal_sync",
    );
  });

  it("does not finalize while session is still ringing", async () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      identity: {
        callId: "call-ring-1",
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
        peerLabel: "Peer",
        peerAvatarUrl: null,
      },
    });

    apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
      session: {
        id: "call-ring-1",
        status: "ringing",
      },
      httpStatus: 200,
      notFound: false,
    });

    startNativeOutgoingTerminalSync("call-ring-1");
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(1500);

    expect(actionsMocks.handleRemoteTerminal).not.toHaveBeenCalled();
  });

  it("stops poll without finalize when callee accepts (active)", async () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      identity: {
        callId: "call-active-1",
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
        peerLabel: "Peer",
        peerAvatarUrl: null,
      },
    });

    apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
      session: {
        id: "call-active-1",
        status: "active",
      },
      httpStatus: 200,
      notFound: false,
    });

    startNativeOutgoingTerminalSync("call-active-1");
    await vi.runOnlyPendingTimersAsync();
    await vi.advanceTimersByTimeAsync(1500);

    expect(actionsMocks.handleRemoteTerminal).not.toHaveBeenCalled();
    expect(useCallV4Store.getState().phase).toBe("connected");
  });

  it("restarts poll without overlapping intervals when start is called twice", async () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      identity: {
        callId: "call-dedupe-1",
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
        peerLabel: "Peer",
        peerAvatarUrl: null,
      },
    });

    apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
      session: { id: "call-dedupe-1", status: "ringing" },
      httpStatus: 200,
      notFound: false,
    });

    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    startNativeOutgoingTerminalSync("call-dedupe-1");
    startNativeOutgoingTerminalSync("call-dedupe-1");

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);

    expect(apiMocks.fetchSessionForCallerPoll.mock.calls.length).toBe(4);

    stopNativeOutgoingTerminalSync("call-dedupe-1");
    const callsBefore = apiMocks.fetchSessionForCallerPoll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(apiMocks.fetchSessionForCallerPoll.mock.calls.length).toBe(callsBefore);
  });
});
