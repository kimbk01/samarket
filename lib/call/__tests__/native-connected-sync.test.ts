import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueNativeConnectedForTests,
  flushPendingNativeConnected,
  onNativeCallConnected,
  resetNativeConnectedSyncForTests,
  type NativeCallConnectedPayload,
} from "@/lib/call/native/native-connected-sync";
import {
  markCallV4NativeConnectedOps,
  resetCallV4ConnectedSideEffectsForTests,
} from "@/lib/community-messenger/call-v4/call-v4-phase-bridge";
import { callV4FetchSession } from "@/lib/community-messenger/call-v4/call-v4-api";
import {
  readCallV4MissedTimerCallIdForTests,
  resetCallV4MissedTimersForTests,
  startCallV4OutgoingMissedTimer,
} from "@/lib/community-messenger/call-v4/call-v4-missed-timeout";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

const heartbeatMocks = vi.hoisted(() => ({
  start: vi.fn(),
}));

const terminalMocks = vi.hoisted(() => ({
  start: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-api", () => ({
  callV4FetchSession: vi.fn(),
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
    vi.useRealTimers();
    useCallV4Store.getState().resetToIdle();
    resetNativeConnectedSyncForTests();
    resetCallV4ConnectedSideEffectsForTests();
    resetCallV4MissedTimersForTests();
    heartbeatMocks.start.mockClear();
    terminalMocks.start.mockClear();
    vi.mocked(callV4FetchSession).mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("hydrates store and starts native connected ops when outgoing session is active", async () => {
    vi.mocked(callV4FetchSession).mockResolvedValue({
      id: "call-o3-1",
      status: "active",
    } as never);

    await onNativeCallConnected(samplePayload());

    expect(callV4FetchSession).toHaveBeenCalledTimes(1);
    expect(callV4FetchSession).toHaveBeenCalledWith("call-o3-1");
    expect(useCallV4Store.getState().phase).toBe("connected");
    expect(useCallV4Store.getState().connectedAt).toBe(1_700_000_000_000);
    expect(useCallV4Store.getState().identity?.callId).toBe("call-o3-1");
    expect(useCallV4Store.getState().identity?.direction).toBe("outgoing");
    expect(useCallV4Store.getState().canStartNewCall).toBe(false);
    expect(heartbeatMocks.start).toHaveBeenCalledWith("call-o3-1");
    expect(terminalMocks.start).toHaveBeenCalledWith("call-o3-1");
  });

  it("hydrates native-owned outgoing connected without waiting for server active", async () => {
    vi.mocked(callV4FetchSession).mockResolvedValue({
      id: "call-o3-1",
      status: "ringing",
    } as never);

    await onNativeCallConnected(samplePayload({ runtime: "native_voice", nativeOwned: true }));

    expect(useCallV4Store.getState().phase).toBe("connected");
    expect(heartbeatMocks.start).toHaveBeenCalledWith("call-o3-1");
    expect(terminalMocks.start).toHaveBeenCalledWith("call-o3-1");
  });

  it("hydrates incoming connected without session fetch gate", async () => {
    await onNativeCallConnected(samplePayload({ direction: "incoming" }));

    expect(callV4FetchSession).not.toHaveBeenCalled();
    expect(useCallV4Store.getState().phase).toBe("connected");
    expect(useCallV4Store.getState().identity?.direction).toBe("incoming");
    expect(heartbeatMocks.start).toHaveBeenCalledWith("call-o3-1");
    expect(terminalMocks.start).toHaveBeenCalledWith("call-o3-1");
  });

  it("ignores duplicate hydrate but keeps ops idempotent after connected hydrate", async () => {
    vi.mocked(callV4FetchSession).mockResolvedValue({
      id: "call-o3-1",
      status: "active",
    } as never);

    await onNativeCallConnected(samplePayload());
    await onNativeCallConnected(samplePayload());

    expect(callV4FetchSession).toHaveBeenCalledTimes(1);
    expect(heartbeatMocks.start).toHaveBeenCalledTimes(1);
    expect(terminalMocks.start).toHaveBeenCalledTimes(1);
  });

  it("ignores payload when nativeOwned is false", async () => {
    await onNativeCallConnected({ ...samplePayload(), nativeOwned: false as true });

    expect(callV4FetchSession).not.toHaveBeenCalled();
    expect(useCallV4Store.getState().phase).toBe("idle");
    expect(heartbeatMocks.start).not.toHaveBeenCalled();
  });

  it("does not hydrate during ending phase", async () => {
    useCallV4Store.getState().setPhase("ending");
    await onNativeCallConnected(samplePayload());

    expect(callV4FetchSession).not.toHaveBeenCalled();
    expect(useCallV4Store.getState().phase).toBe("ending");
    expect(heartbeatMocks.start).not.toHaveBeenCalled();
  });

  it("clears outgoing missed timer when native connected side effects start", async () => {
    vi.useFakeTimers();
    const startedAt = new Date("2026-07-03T01:04:16.000Z").toISOString();
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      identity: {
        callId: "call-o3-1",
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: startedAt,
      },
    });
    startCallV4OutgoingMissedTimer("call-o3-1", startedAt);
    expect(readCallV4MissedTimerCallIdForTests()).toBe("call-o3-1");

    vi.mocked(callV4FetchSession).mockResolvedValue({
      id: "call-o3-1",
      status: "active",
    } as never);

    await onNativeCallConnected(samplePayload());

    expect(readCallV4MissedTimerCallIdForTests()).toBeNull();
  });

  it("flushPendingNativeConnected hydrates queued payloads before listener ready", async () => {
    enqueueNativeConnectedForTests(samplePayload({ direction: "incoming" }));
    expect(useCallV4Store.getState().phase).toBe("idle");

    await flushPendingNativeConnected();

    expect(useCallV4Store.getState().phase).toBe("connected");
    expect(useCallV4Store.getState().identity?.callId).toBe("call-o3-1");
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
