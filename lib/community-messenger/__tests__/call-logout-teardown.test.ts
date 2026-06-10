import { beforeEach, describe, expect, it, vi } from "vitest";

const resetCall = vi.fn();
const forceRelease = vi.fn();
const cleanupMedia = vi.fn();
const patchTerminal = vi.fn();
const resetRuntimeSurface = vi.fn();

vi.mock("@/lib/community-messenger/stores/useCallStore", () => ({
  useCallStore: {
    getState: () => ({ resetCall }),
  },
}));

vi.mock("@/lib/community-messenger/realtime/cm-incoming-call-realtime-holder", () => ({
  forceReleaseAllIncomingCallRealtimeSubscriptions: () => forceRelease(),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  stopCommunityMessengerCallTone: vi.fn(),
  stopCommunityMessengerCallFeedback: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-runtime-registry", () => ({
  getCommunityMessengerCallRuntime: () => ({
    cleanupMedia,
    patchTerminalBestEffort: patchTerminal,
  }),
  resetCommunityMessengerCallRuntimeSurface: () => resetRuntimeSurface(),
}));

vi.mock("@/components/layout/providers/CommunityMessengerActiveCallHost", () => ({
  notifyCommunityCallHostSync: vi.fn(),
}));

describe("teardownCommunityMessengerCallOnAuthExit", () => {
  beforeEach(() => {
    resetCall.mockReset();
    forceRelease.mockReset();
    cleanupMedia.mockReset();
    patchTerminal.mockReset();
    resetRuntimeSurface.mockReset();
    cleanupMedia.mockResolvedValue(undefined);
    patchTerminal.mockResolvedValue(undefined);
  });

  it("resets call store and releases incoming realtime", async () => {
    const { teardownCommunityMessengerCallOnAuthExit } = await import(
      "@/lib/community-messenger/call-logout-teardown"
    );
    await teardownCommunityMessengerCallOnAuthExit("logout");
    expect(patchTerminal).toHaveBeenCalledWith("logout");
    expect(cleanupMedia).toHaveBeenCalled();
    expect(resetRuntimeSurface).toHaveBeenCalled();
    expect(forceRelease).toHaveBeenCalled();
    expect(resetCall).toHaveBeenCalled();
  });
});
