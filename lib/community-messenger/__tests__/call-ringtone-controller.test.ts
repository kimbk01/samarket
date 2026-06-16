import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  startCommunityMessengerCallTone: vi.fn(async () => ({ stop: vi.fn() })),
  stopCommunityMessengerCallTone: vi.fn(),
}));

import { startCommunityMessengerCallTone } from "@/lib/community-messenger/call-feedback-sound";
import {
  getActiveIncomingRingtoneSessionId,
  playIncomingCallRingtone,
  shouldPreserveIncomingRingtoneOnCallRoute,
  stopCallRingtone,
} from "@/lib/community-messenger/call-ringtone-controller";

describe("call-ringtone-controller", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {} as Window & typeof globalThis);
    vi.clearAllMocks();
    stopCallRingtone("test_reset");
  });

  it("plays incoming ringtone once per sessionId", async () => {
    playIncomingCallRingtone("session-a", "voice");
    playIncomingCallRingtone("session-a", "voice");
    await vi.waitFor(() => {
      expect(startCommunityMessengerCallTone).toHaveBeenCalledTimes(1);
    });
    expect(getActiveIncomingRingtoneSessionId()).toBe("session-a");
  });

  it("preserves ringtone while incoming start is still in flight", () => {
    playIncomingCallRingtone("session-a", "voice");
    expect(shouldPreserveIncomingRingtoneOnCallRoute("session-a")).toBe(true);
  });

  it("preserves ringtone when navigating to the same call route", async () => {
    playIncomingCallRingtone("session-a", "voice");
    await vi.waitFor(() => {
      expect(getActiveIncomingRingtoneSessionId()).toBe("session-a");
    });
    expect(shouldPreserveIncomingRingtoneOnCallRoute("session-a")).toBe(true);
    expect(shouldPreserveIncomingRingtoneOnCallRoute("session-b")).toBe(false);
  });

  it("stops active incoming ringtone for matching session", async () => {
    playIncomingCallRingtone("session-a", "voice");
    await vi.waitFor(() => {
      expect(getActiveIncomingRingtoneSessionId()).toBe("session-a");
    });
    stopCallRingtone("reject", "session-a");
    expect(getActiveIncomingRingtoneSessionId()).toBeNull();
  });
});
