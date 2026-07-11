/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invokeCallV4ConnectedBackMinimize,
  readCallV4Capabilities,
  registerCallV4ConnectedBackMinimize,
  releaseCallV4OutgoingGateAfterTerminalFinalize,
  resetCallV4ConnectedBackMinimizeForTests,
  useCallV4Store,
} from "@/lib/community-messenger/call-v4/call-v4-store";

describe("useCallV4Store setPhase connected downgrade guard", () => {
  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    resetCallV4ConnectedBackMinimizeForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it.each(["outgoing_ringing", "creating", "incoming_ringing", "joining", "accepting"] as const)(
    "blocks downgrade from connected to %s",
    (toPhase) => {
      useCallV4Store.getState().setPhase("connected");
      useCallV4Store.getState().setPhase(toPhase);
      expect(useCallV4Store.getState().phase).toBe("connected");
    },
  );

  it("allows transition from connected to ending", () => {
    useCallV4Store.getState().setPhase("connected");
    useCallV4Store.getState().setPhase("ending");
    expect(useCallV4Store.getState().phase).toBe("ending");
  });

  it("allows resetToIdle from connected", () => {
    useCallV4Store.getState().setPhase("connected");
    useCallV4Store.getState().resetToIdle();
    expect(useCallV4Store.getState().phase).toBe("idle");
  });
});

describe("registerCallV4ConnectedBackMinimize", () => {
  beforeEach(() => {
    resetCallV4ConnectedBackMinimizeForTests();
  });

  it("invokes registered minimize handler", () => {
    const handler = vi.fn();
    registerCallV4ConnectedBackMinimize(handler);
    invokeCallV4ConnectedBackMinimize();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("releaseCallV4OutgoingGateAfterTerminalFinalize", () => {
  const identity = {
    callId: "call-s5",
    roomId: "room-1",
    callerUserId: "u-a",
    calleeUserId: "u-b",
    direction: "outgoing" as const,
    mediaType: "audio" as const,
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    useCallV4Store.getState().resetToIdle();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("releases gate after terminal finalize when connected and identity matches", () => {
    useCallV4Store.setState({
      phase: "connected",
      identity,
      connectedAt: Date.now(),
      canStartNewCall: false,
    });

    const released = releaseCallV4OutgoingGateAfterTerminalFinalize({
      callId: "call-s5",
      status: "ended",
      source: "poll",
    });

    expect(released).toBe(true);
    expect(readCallV4Capabilities().canStartNewCall).toBe(true);
    expect(useCallV4Store.getState().phase).toBe("connected");
  });

  it("keeps gate false before release is invoked (remote_terminal_received only)", () => {
    useCallV4Store.setState({
      phase: "connected",
      identity,
      connectedAt: Date.now(),
      canStartNewCall: false,
    });

    expect(readCallV4Capabilities().canStartNewCall).toBe(false);
  });

  it("does not release for wrong callId", () => {
    useCallV4Store.setState({
      phase: "connected",
      identity,
      connectedAt: Date.now(),
      canStartNewCall: false,
    });

    const released = releaseCallV4OutgoingGateAfterTerminalFinalize({
      callId: "other-call",
      status: "ended",
    });

    expect(released).toBe(false);
    expect(readCallV4Capabilities().canStartNewCall).toBe(false);
  });

  it("does not release when phase is creating", () => {
    useCallV4Store.setState({
      phase: "creating",
      identity,
      canStartNewCall: false,
    });

    const released = releaseCallV4OutgoingGateAfterTerminalFinalize({
      callId: "call-s5",
      status: "ended",
    });

    expect(released).toBe(false);
    expect(readCallV4Capabilities().canStartNewCall).toBe(false);
  });

  it("releases gate when phase is outgoing_ringing after terminal finalize", () => {
    useCallV4Store.setState({
      phase: "outgoing_ringing",
      identity,
      canStartNewCall: false,
    });

    const released = releaseCallV4OutgoingGateAfterTerminalFinalize({
      callId: "call-s5",
      status: "ended",
      source: "native_local_terminal",
    });

    expect(released).toBe(true);
    expect(readCallV4Capabilities().canStartNewCall).toBe(true);
    expect(useCallV4Store.getState().phase).toBe("outgoing_ringing");
  });
});
