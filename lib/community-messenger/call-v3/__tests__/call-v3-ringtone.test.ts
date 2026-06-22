import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetCallV3RingtoneForTests, startCallV3Ringtone, readCallV3ActiveRingtoneCallId, stopCallV3Ringtone } from "@/lib/community-messenger/call-v3/call-v3-ringtone";

const toneMocks = vi.hoisted(() => ({
  start: vi.fn(async () => ({ stop: vi.fn() })),
  stopAll: vi.fn(),
  unlock: vi.fn(),
}));

vi.mock("@/lib/community-messenger/call-feedback-sound", () => ({
  startCommunityMessengerCallTone: toneMocks.start,
  stopCommunityMessengerCallTone: toneMocks.stopAll,
  unlockCommunityMessengerCallPlaybackFromUserGesture: toneMocks.unlock,
}));

describe("call-v3-ringtone", () => {
  beforeEach(() => {
    resetCallV3RingtoneForTests();
    toneMocks.start.mockClear();
    toneMocks.stopAll.mockClear();
    toneMocks.unlock.mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("starts ringtone once per callId", () => {
    startCallV3Ringtone("call-1", "voice");
    startCallV3Ringtone("call-1", "voice");
    expect(toneMocks.start).toHaveBeenCalledTimes(1);
    expect(readCallV3ActiveRingtoneCallId()).toBe("call-1");
  });

  it("stops ringtone and clears owner", () => {
    startCallV3Ringtone("call-1", "voice");
    stopCallV3Ringtone("test");
    expect(toneMocks.stopAll).toHaveBeenCalled();
    expect(readCallV3ActiveRingtoneCallId()).toBeNull();
  });
});
