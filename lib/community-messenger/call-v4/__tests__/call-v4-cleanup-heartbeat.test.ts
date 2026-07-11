import { beforeEach, describe, expect, it, vi } from "vitest";

const heartbeatMocks = vi.hoisted(() => ({
  stop: vi.fn(),
}));

vi.mock("@/lib/call/native/call-heartbeat-watchdog", () => ({
  stopCallHeartbeatWatchdog: (...args: unknown[]) => heartbeatMocks.stop(...args),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-caller-active", () => ({
  stopCallV4CallerActivePoll: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-connected-terminal-watch", () => ({
  stopCallV4ConnectedTerminalWatch: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-connection-warm", () => ({
  clearCallV4ConnectionWarm: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-agora", () => ({
  leaveCallV4Agora: vi.fn(async () => {}),
}));

const releaseAudioRouteMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-audio-route", () => ({
  releaseCallV4AudioRoute: releaseAudioRouteMock,
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-patch-guard", () => ({
  resetCallV4AcceptPatchStateForCallId: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-incoming-surface", () => ({
  clearCallV4NativeAcceptingSurface: vi.fn(),
  clearCallV4NativeIncomingSurface: vi.fn(),
  clearCallV4SurfaceOwner: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-native-accept-flight", () => ({
  clearNativeAcceptInflight: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-native-lifecycle", () => ({
  syncCallV4NativeTerminalCleanup: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-media-state", () => ({
  useCallV4MediaStore: {
    getState: () => ({ reset: vi.fn() }),
  },
}));

vi.mock("@/lib/community-messenger/call-v4/call-v4-native-active-session", () => ({
  stopCallV4NativeActiveSession: vi.fn(async () => {}),
}));

vi.mock("@/lib/community-messenger/call-runtime-registry", () => ({
  forceResetCommunityMessengerCallRuntimeSurface: vi.fn(),
}));

import { cleanupCallV4 } from "@/lib/community-messenger/call-v4/call-v4-cleanup";
import { stopCallV4NativeActiveSession } from "@/lib/community-messenger/call-v4/call-v4-native-active-session";
import { useCallV4Store } from "@/lib/community-messenger/call-v4/call-v4-store";

describe("cleanupCallV4 heartbeat", () => {
  beforeEach(() => {
    heartbeatMocks.stop.mockClear();
    releaseAudioRouteMock.mockClear();
    useCallV4Store.getState().resetToIdle();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("stops heartbeat watchdog before other teardown", async () => {
    await cleanupCallV4("call-hb", "ended");
    expect(heartbeatMocks.stop).toHaveBeenCalledWith("call-hb");
    expect(heartbeatMocks.stop).toHaveBeenCalledTimes(1);
    expect(releaseAudioRouteMock).toHaveBeenCalledWith("call-hb", "v4_cleanup");
  });

  it("reaches cleanup_done when native active session stop throws", async () => {
    vi.mocked(stopCallV4NativeActiveSession).mockRejectedValueOnce(new Error("plugin_unavailable"));
    await expect(cleanupCallV4("call-native-fail", "ended")).resolves.toBeUndefined();
    expect(stopCallV4NativeActiveSession).toHaveBeenCalledWith("call-native-fail", "ended");
    expect(useCallV4Store.getState().phase).toBe("idle");
  });
});
