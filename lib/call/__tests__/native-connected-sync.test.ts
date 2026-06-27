import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  onNativeCallConnected,
  resetNativeConnectedSyncForTests,
  type NativeCallConnectedPayload,
} from "@/lib/call/native/native-connected-sync";
import {
  markCallV4NativeConnectedOps,
  resetCallV4ConnectedSideEffectsForTests,
} from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const heartbeatMocks = vi.hoisted(() => ({
  start: vi.fn(),
}));

const terminalMocks = vi.hoisted(() => ({
  start: vi.fn(),
}));

vi.mock("@/lib/call/native/call-heartbeat-watchdog", () => ({
  startCallHeartbeatWatchdog: (...args: unknown[]) => heartbeatMocks.start(...args),
  stopCallHeartbeatWatchdog: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch", () => ({
  startCallV4ConnectedTerminalWatch: (...args: unknown[]) => terminalMocks.start(...args),
  stopCallV4ConnectedTerminalWatch: vi.fn(),
}));

function samplePayload(overrides: Partial<NativeCallConnectedPayload> = {}): NativeCallConnectedPayload {
  return {
    callId: "call-o3-1",
    roomId: "room-1",
    mediaType: "voice",
    direction: "outgoing",
    peerUserId: "peer-1",
    peerName: "Peer",
    connectedAtMs: 1_700_000_000_000,
    nativeOwned: true,
    runtime: "native_voice",
    fgsOwner: "NativeVoiceCallService",
    source: "native_connected_bridge",
    ...overrides,
  };
}

describe("native-connected-sync", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    resetNativeConnectedSyncForTests();
    resetCallV4ConnectedSideEffectsForTests();
    heartbeatMocks.start.mockClear();
    terminalMocks.start.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("hydrates store and starts native connected ops from idle", async () => {
    await onNativeCallConnected(samplePayload());

    expect(useCallV4Store.getState().phase).toBe("connected");
    expect(useCallV4Store.getState().identity?.callId).toBe("call-o3-1");
    expect(useCallV4Store.getState().identity?.direction).toBe("outgoing");
    expect(useCallV4Store.getState().canStartNewCall).toBe(false);
    expect(heartbeatMocks.start).toHaveBeenCalledWith("call-o3-1");
    expect(terminalMocks.start).toHaveBeenCalledWith("call-o3-1");
  });

  it("ignores duplicate hydrate but keeps ops idempotent", async () => {
    await onNativeCallConnected(samplePayload());
    await onNativeCallConnected(samplePayload());

    expect(heartbeatMocks.start).toHaveBeenCalledTimes(1);
    expect(terminalMocks.start).toHaveBeenCalledTimes(1);
  });

  it("ignores payload when nativeOwned is false", async () => {
    await onNativeCallConnected({ ...samplePayload(), nativeOwned: false as true });

    expect(useCallV4Store.getState().phase).toBe("idle");
    expect(heartbeatMocks.start).not.toHaveBeenCalled();
  });

  it("does not hydrate during ending phase", async () => {
    useCallV4Store.getState().setPhase("ending");
    await onNativeCallConnected(samplePayload());

    expect(useCallV4Store.getState().phase).toBe("ending");
    expect(heartbeatMocks.start).not.toHaveBeenCalled();
  });
});

describe("markCallV4NativeConnectedOps", () => {
  beforeEach(() => {
    resetCallV4ConnectedSideEffectsForTests();
    heartbeatMocks.start.mockClear();
    terminalMocks.start.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("starts heartbeat and terminal watch without markCallV4MediaConnected", () => {
    expect(markCallV4NativeConnectedOps("call-ops-1", "test")).toBe(true);
    expect(markCallV4NativeConnectedOps("call-ops-1", "test")).toBe(true);
    expect(heartbeatMocks.start).toHaveBeenCalledTimes(1);
    expect(terminalMocks.start).toHaveBeenCalledTimes(1);
  });
});
