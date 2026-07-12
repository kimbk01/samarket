import { beforeEach, describe, expect, it, vi } from "vitest";

const cleanupMocks = vi.hoisted(() => ({
  cleanup: vi.fn<(callId: string, reason: string) => Promise<void>>(async () => undefined),
  endNative: vi.fn<(callId: string, reason: string) => Promise<boolean>>(async () => true),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-cleanup", () => ({
  cleanupCallV4: (callId: string, reason: string) => cleanupMocks.cleanup(callId, reason),
}));

vi.mock("@/lib/call/native/native-call-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/call/native/native-call-service")>();
  return {
    ...actual,
    endNativeCallService: (callId: string, reason: string) => cleanupMocks.endNative(callId, reason),
  };
});

import {
  enqueueNativeConnectedForTests,
  flushPendingNativeConnected,
  resetNativeConnectedSyncForTests,
} from "@/lib/call/native/native-connected-sync";
import {
  onNativeCallLocalTerminal,
  resetNativeTerminalSyncForTests,
  type NativeCallTerminalPayload,
} from "@/lib/call/native/native-terminal-sync";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

function sampleTerminal(overrides: Partial<NativeCallTerminalPayload> = {}): NativeCallTerminalPayload {
  return {
    callId: "call-end-1",
    reason: "ended",
    source: "local_end_begin",
    nativeOwned: true,
    ...overrides,
  };
}

describe("native-terminal-sync", () => {
  beforeEach(() => {
    resetNativeTerminalSyncForTests();
    resetNativeConnectedSyncForTests();
    cleanupMocks.cleanup.mockClear();
    cleanupMocks.endNative.mockClear();
    useCallV4Store.getState().resetToIdle();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("resets to idle immediately on native local terminal for current identity", async () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      canStartNewCall: false,
      identity: {
        callId: "call-end-1",
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    await onNativeCallLocalTerminal(sampleTerminal());

    expect(useCallV4Store.getState().phase).toBe("idle");
    expect(useCallV4Store.getState().canStartNewCall).toBe(true);
    expect(cleanupMocks.cleanup).toHaveBeenCalledWith("call-end-1", "ended");
  });

  it("ignores terminal for non-current identity", async () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      identity: {
        callId: "other-call",
        roomId: "room-1",
        callerUserId: "",
        calleeUserId: "peer-1",
        direction: "outgoing",
        mediaType: "audio",
        createdAt: new Date().toISOString(),
      },
    });

    await onNativeCallLocalTerminal(sampleTerminal());

    expect(useCallV4Store.getState().phase).toBe("outgoing_ringing");
    expect(cleanupMocks.cleanup).not.toHaveBeenCalled();
    expect(cleanupMocks.endNative).toHaveBeenCalledWith("call-end-1", "native_stale_terminal");
  });

  it("flushes pending connected before terminal so identity is set for idle reset", async () => {
    resetNativeConnectedSyncForTests();
    enqueueNativeConnectedForTests({
      callId: "call-end-1",
      roomId: "room-1",
      mediaType: "video",
      direction: "incoming",
      peerUserId: "peer-1",
      peerName: "Peer",
      connectedAtMs: 1_700_000_000_000,
      nativeOwned: true,
      runtime: "native_video",
      fgsOwner: "NativeVideoCall",
      source: "native_connected_bridge",
    });

    await flushPendingNativeConnected();
    expect(useCallV4Store.getState().phase).toBe("connected");
    expect(useCallV4Store.getState().identity?.callId).toBe("call-end-1");

    await onNativeCallLocalTerminal(sampleTerminal());

    expect(useCallV4Store.getState().phase).toBe("idle");
    expect(useCallV4Store.getState().canStartNewCall).toBe(true);
    expect(cleanupMocks.cleanup).toHaveBeenCalledWith("call-end-1", "ended");
  });
});
