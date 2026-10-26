import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  fetchSessionForCallerPoll: vi.fn(),
  isNativeOwned: vi.fn(async () => true),
}));

const platformMocks = vi.hoisted(() => ({
  shell: null as "ios" | "android" | null,
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

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => platformMocks.shell !== null,
  resolveCapacitorShellPlatform: () => platformMocks.shell,
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
    platformMocks.shell = null;
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
  it("finalizes via server status when native already released the outgoing screen", async () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      identity: {
        callId: "call-native-released-1",
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
    apiMocks.isNativeOwned.mockResolvedValue(false);
    apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
      session: { id: "call-native-released-1", status: "rejected" },
      httpStatus: 200,
      notFound: false,
    });

    startNativeOutgoingTerminalSync("call-native-released-1");
    await vi.runOnlyPendingTimersAsync();

    expect(actionsMocks.handleRemoteTerminal).toHaveBeenCalledTimes(1);
    expect(actionsMocks.handleRemoteTerminal).toHaveBeenCalledWith(
      "call-native-released-1",
      "rejected",
      undefined,
      "outgoing_terminal_sync_native_released",
    );
    const callsAfter = apiMocks.fetchSessionForCallerPoll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);
    expect(apiMocks.fetchSessionForCallerPoll.mock.calls.length).toBe(callsAfter);
  });

  it("stops without finalize when native released but server session is not terminal", async () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      identity: {
        callId: "call-native-released-2",
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
    apiMocks.isNativeOwned.mockResolvedValue(false);
    apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
      session: { id: "call-native-released-2", status: "ringing" },
      httpStatus: 200,
      notFound: false,
    });

    startNativeOutgoingTerminalSync("call-native-released-2");
    await vi.runOnlyPendingTimersAsync();
    const callsAfter = apiMocks.fetchSessionForCallerPoll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(2000);

    expect(actionsMocks.handleRemoteTerminal).not.toHaveBeenCalled();
    expect(apiMocks.fetchSessionForCallerPoll.mock.calls.length).toBe(callsAfter);
  });

  describe("R3-a native watch owns server status (iOS)", () => {
    const ringingIdentity = (callId: string) => ({
      phase: "outgoing_ringing" as const,
      canStartNewCall: false,
      identity: {
        callId,
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing" as const,
        mediaType: "audio" as const,
        createdAt: new Date().toISOString(),
        peerLabel: "Peer",
        peerAvatarUrl: null,
      },
    });

    it("iOS: no session GET while native owns the outgoing call", async () => {
      platformMocks.shell = "ios";
      useCallV4Store.setState(ringingIdentity("call-ios-owned-1"));
      apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
        session: { id: "call-ios-owned-1", status: "ringing" },
        httpStatus: 200,
        notFound: false,
      });

      startNativeOutgoingTerminalSync("call-ios-owned-1");
      await vi.runOnlyPendingTimersAsync();
      await vi.advanceTimersByTimeAsync(5000);

      expect(apiMocks.isNativeOwned).toHaveBeenCalled();
      expect(apiMocks.fetchSessionForCallerPoll).not.toHaveBeenCalled();
      expect(actionsMocks.handleRemoteTerminal).not.toHaveBeenCalled();
    });

    it("iOS: one GET and finalize after native releases on a terminal session", async () => {
      platformMocks.shell = "ios";
      useCallV4Store.setState(ringingIdentity("call-ios-released-1"));
      apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
        session: { id: "call-ios-released-1", status: "missed" },
        httpStatus: 200,
        notFound: false,
      });

      startNativeOutgoingTerminalSync("call-ios-released-1");
      await vi.runOnlyPendingTimersAsync();
      await vi.advanceTimersByTimeAsync(2000);
      expect(apiMocks.fetchSessionForCallerPoll).not.toHaveBeenCalled();

      apiMocks.isNativeOwned.mockResolvedValue(false);
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(2000);

      expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalledTimes(1);
      expect(actionsMocks.handleRemoteTerminal).toHaveBeenCalledTimes(1);
      expect(actionsMocks.handleRemoteTerminal).toHaveBeenCalledWith(
        "call-ios-released-1",
        "missed",
        undefined,
        "outgoing_terminal_sync_native_released",
      );
    });

    it("Android: keeps the session GET poll as the FCM backup", async () => {
      platformMocks.shell = "android";
      useCallV4Store.setState(ringingIdentity("call-android-owned-1"));
      apiMocks.fetchSessionForCallerPoll.mockResolvedValue({
        session: { id: "call-android-owned-1", status: "rejected" },
        httpStatus: 200,
        notFound: false,
      });

      startNativeOutgoingTerminalSync("call-android-owned-1");
      await vi.runOnlyPendingTimersAsync();

      expect(apiMocks.fetchSessionForCallerPoll).toHaveBeenCalled();
      expect(actionsMocks.handleRemoteTerminal).toHaveBeenCalledWith(
        "call-android-owned-1",
        "rejected",
        undefined,
        "outgoing_terminal_sync",
      );
    });
  });
});
