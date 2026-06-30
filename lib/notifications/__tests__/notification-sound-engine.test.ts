/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { resolveNotificationSound } from "@/lib/notifications/notification-sound-resolver";

vi.mock("@/lib/notifications/notification-sound-resolver", () => ({
  resolveNotificationSound: vi.fn(),
}));

describe("playEventNotificationSound", () => {
  beforeEach(() => {
    vi.mocked(resolveNotificationSound).mockReset();
  });

  it("does not play when SSOT resolves without webUrl (no hardcoded wav fallback)", async () => {
    vi.mocked(resolveNotificationSound).mockReturnValue({
      eventKey: "call_incoming_voice",
      assetId: "SND-900",
      kind: "device_default",
      webUrl: null,
      iosSoundName: "default",
      androidChannelId: "dibay_calls_incoming_v7",
      vibration: true,
      volume: 0.7,
      repeatCount: 1,
      cooldownSeconds: 0,
      priority: "high",
      enabled: true,
      resolvedFrom: "event_default",
      legacySource: null,
    });

    const playSpy = vi.spyOn(HTMLAudioElement.prototype, "play").mockImplementation(() => Promise.resolve());

    await playEventNotificationSound("call_incoming_voice");

    expect(playSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
  });
});
