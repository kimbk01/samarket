import { beforeEach, describe, expect, it, vi } from "vitest";
import { markCallV4MediaConnected, markCallV4NativeConnectedOps, resetCallV4ConnectedSideEffectsForTests } from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { writeCallV4ConnectedGateAgoraSignals, resetCallV4ConnectedGateForTests } from "@/lib/community-messenger/call-v4/call-v4-connected-gate";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const heartbeatMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@/lib/call/native/call-heartbeat-watchdog", () => ({
  startCallHeartbeatWatchdog: (...args: unknown[]) => heartbeatMocks.start(...args),
  stopCallHeartbeatWatchdog: (...args: unknown[]) => heartbeatMocks.stop(...args),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch", () => ({
  startCallV4ConnectedTerminalWatch: vi.fn(),
}));

describe("call-v4-phase-bridge", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    resetCallV4ConnectedGateForTests();
    resetCallV4ConnectedSideEffectsForTests();
    heartbeatMocks.start.mockClear();
    heartbeatMocks.stop.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  function seedAudioGateReady(callId: string): void {
    writeCallV4ConnectedGateAgoraSignals(callId, {
      sessionStatus: "active",
      agoraJoinSuccess: true,
      remoteAudioSubscribed: false,
      localVideoPublishDone: false,
    });
  }

  it("promotes joining caller to connected when media is ready", () => {
    useCallV4Store.setState({
      phase: "joining",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    seedAudioGateReady("call-1");

    expect(markCallV4MediaConnected("call-1", "test")).toBe(true);
    expect(useCallV4Store.getState().phase).toBe("connected");
    expect(useCallV4Store.getState().connectedAt).not.toBeNull();
    expect(heartbeatMocks.start).toHaveBeenCalledWith("call-1");
    expect(heartbeatMocks.start).toHaveBeenCalledTimes(1);
  });

  it("ignores mismatched callId", () => {
    useCallV4Store.setState({
      phase: "joining",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    seedAudioGateReady("call-1");

    expect(markCallV4MediaConnected("call-2", "test")).toBe(false);
    expect(useCallV4Store.getState().phase).toBe("joining");
    expect(heartbeatMocks.start).not.toHaveBeenCalled();
  });

  it("does not restart heartbeat when already connected", () => {
    useCallV4Store.setState({
      phase: "connected",
      connectedAt: Date.now(),
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    seedAudioGateReady("call-1");

    expect(markCallV4MediaConnected("call-1", "test")).toBe(true);
    expect(heartbeatMocks.start).not.toHaveBeenCalled();
  });

  it("blocks promotion when gate prerequisites are missing", () => {
    useCallV4Store.setState({
      phase: "joining",
      identity: {
        callId: "call-1",
        roomId: "room-1",
        callerUserId: "a",
        calleeUserId: "b",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    expect(markCallV4MediaConnected("call-1", "test")).toBe(false);
    expect(useCallV4Store.getState().phase).toBe("joining");
    expect(heartbeatMocks.start).not.toHaveBeenCalled();
  });

  it("starts ops via native connected path without connected gate", () => {
    useCallV4Store.getState().resetToIdle();
    resetCallV4ConnectedSideEffectsForTests();
    heartbeatMocks.start.mockClear();

    expect(markCallV4NativeConnectedOps("call-native-1", "native_connected")).toBe(true);
    expect(useCallV4Store.getState().phase).toBe("idle");
    expect(heartbeatMocks.start).toHaveBeenCalledWith("call-native-1");
    expect(markCallV4NativeConnectedOps("call-native-1", "native_connected")).toBe(true);
    expect(heartbeatMocks.start).toHaveBeenCalledTimes(1);
  });
});
