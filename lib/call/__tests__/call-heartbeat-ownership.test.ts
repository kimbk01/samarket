import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubVitestMinimalWindow } from "@/lib/test-utils/vitest-minimal-window";

vi.mock("@/lib/call/call-server-heartbeat-client", () => ({
  patchCallSessionHeartbeat: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/platform/capacitor-native", () => ({
  isCapacitorNativePlatform: () => false,
}));

vi.mock("@/lib/call/native/native-call-service", () => ({
  nativeCallService: {
    heartbeat: vi.fn(async () => {}),
    getActiveCallId: vi.fn(async () => null),
  },
}));

vi.mock("@/lib/community-messenger/call-engine", () => ({
  callEngineActions: {
    patch: vi.fn(async () => ({ ok: true })),
  },
}));

import {
  getActiveCallHeartbeatWatchdogCallId,
  isCallHeartbeatWatchdogActive,
  resetCallHeartbeatWatchdogForTests,
  resolveCallClientHeartbeatAction,
  startCallHeartbeatWatchdog,
  stopCallHeartbeatWatchdog,
} from "@/lib/call/native/call-heartbeat-watchdog";

describe("call heartbeat ownership SSOT", () => {
  beforeEach(() => {
    stubVitestMinimalWindow();
    resetCallHeartbeatWatchdogForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetCallHeartbeatWatchdogForTests();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("TEST1 Native connected active joined=false → CallClient retains (does not stop)", () => {
    startCallHeartbeatWatchdog("call-native-1", "native_connected");
    expect(isCallHeartbeatWatchdogActive("call-native-1")).toBe(true);

    const action = resolveCallClientHeartbeatAction({
      isTerminal: false,
      phase: "active",
      joined: false,
    });
    expect(action).toBe("retain");
    if (action === "stop") {
      stopCallHeartbeatWatchdog("call-native-1", "call_client_non_active");
    }
    expect(isCallHeartbeatWatchdogActive("call-native-1")).toBe(true);
  });

  it("TEST2 Web joined active → CallClient starts watchdog", () => {
    const action = resolveCallClientHeartbeatAction({
      isTerminal: false,
      phase: "active",
      joined: true,
    });
    expect(action).toBe("start");
    if (action === "start") {
      startCallHeartbeatWatchdog("call-web-1", "call_client_agora_joined");
    }
    expect(isCallHeartbeatWatchdogActive("call-web-1")).toBe(true);
  });

  it("TEST3 joined true→false transient while Native active → watchdog NOT stopped", () => {
    startCallHeartbeatWatchdog("call-native-2", "native_connected");
    expect(
      resolveCallClientHeartbeatAction({ isTerminal: false, phase: "active", joined: true }),
    ).toBe("start");
    startCallHeartbeatWatchdog("call-native-2", "call_client_agora_joined");

    const afterLeave = resolveCallClientHeartbeatAction({
      isTerminal: false,
      phase: "active",
      joined: false,
    });
    expect(afterLeave).toBe("retain");
    if (afterLeave === "stop") {
      stopCallHeartbeatWatchdog("call-native-2", "call_client_non_active");
    }
    expect(isCallHeartbeatWatchdogActive("call-native-2")).toBe(true);
  });

  it("TEST4 terminal session → CallClient stops watchdog", () => {
    startCallHeartbeatWatchdog("call-term-1", "native_connected");
    const action = resolveCallClientHeartbeatAction({
      isTerminal: true,
      phase: "active",
      joined: false,
    });
    expect(action).toBe("stop");
    stopCallHeartbeatWatchdog("call-term-1", "call_client_terminal");
    expect(isCallHeartbeatWatchdogActive("call-term-1")).toBe(false);
  });

  it("TEST5 session replaced → old watchdog stopped, new ownership correct", () => {
    startCallHeartbeatWatchdog("call-old", "native_connected");
    expect(getActiveCallHeartbeatWatchdogCallId()).toBe("call-old");

    startCallHeartbeatWatchdog("call-new", "native_connected");
    expect(getActiveCallHeartbeatWatchdogCallId()).toBe("call-new");
    expect(isCallHeartbeatWatchdogActive("call-old")).toBe(false);
    expect(isCallHeartbeatWatchdogActive("call-new")).toBe(true);
  });

  it("TEST6 repeated START same session → one timer only", () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    startCallHeartbeatWatchdog("call-once", "native_connected");
    const firstIntervals = setIntervalSpy.mock.calls.length;
    startCallHeartbeatWatchdog("call-once", "native_connected");
    startCallHeartbeatWatchdog("call-once", "call_client_agora_joined");
    expect(isCallHeartbeatWatchdogActive("call-once")).toBe(true);
    expect(getActiveCallHeartbeatWatchdogCallId()).toBe("call-once");
    // Each start creates one interval after clearing previous — net one active handle
    expect(setIntervalSpy.mock.calls.length - firstIntervals).toBe(2);
    expect(isCallHeartbeatWatchdogActive("call-once")).toBe(true);
  });

  it("non-active phase still stops (7aa1640cc cleanup preserved)", () => {
    startCallHeartbeatWatchdog("call-ring", "premature");
    const action = resolveCallClientHeartbeatAction({
      isTerminal: false,
      phase: "ringing",
      joined: false,
    });
    expect(action).toBe("stop");
    stopCallHeartbeatWatchdog("call-ring", "call_client_non_active");
    expect(isCallHeartbeatWatchdogActive()).toBe(false);
  });
});
