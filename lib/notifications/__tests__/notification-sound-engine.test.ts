/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { playEventNotificationSound } from "@/lib/notifications/notification-sound-engine";
import { resolveNotificationSound } from "@/lib/notifications/notification-sound-resolver";
import { ensureNotificationSoundSsotHydratedForClient } from "@/lib/notifications/notification-sound-ssot-client-hydrate";

vi.mock("@/lib/notifications/notification-sound-resolver", () => ({
  resolveNotificationSound: vi.fn(),
}));

vi.mock("@/lib/notifications/notification-sound-ssot-client-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForClient: vi.fn().mockResolvedValue(undefined),
  invalidateNotificationSoundSsotClientHydrate: vi.fn(),
}));

describe("playEventNotificationSound", () => {
  beforeEach(() => {
    vi.mocked(resolveNotificationSound).mockReset();
    vi.mocked(ensureNotificationSoundSsotHydratedForClient).mockClear();
  });

  it("hydrates SSOT before resolve", async () => {
    vi.mocked(resolveNotificationSound).mockReturnValue({
      eventKey: "messenger_direct_message_received",
      assetId: "DIBAY-SND-010",
      kind: "dibay_default",
      webUrl: "https://cdn.example.com/msg.wav",
      iosSoundName: "default",
      androidChannelId: "dibay_chat_messages_v1",
      vibration: true,
      volume: 0.7,
      repeatCount: 1,
      cooldownSeconds: 0,
      priority: "default",
      enabled: true,
      resolvedFrom: "admin_mapping",
      legacySource: null,
    });

    await playEventNotificationSound("messenger_direct_message_received");

    expect(ensureNotificationSoundSsotHydratedForClient).toHaveBeenCalledTimes(1);
    expect(resolveNotificationSound).toHaveBeenCalledWith("messenger_direct_message_received", {
      platform: "web",
    });
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

  it("cancels play after hydrate when room entry invalidates pending playback", async () => {
    let resolveHydrate!: () => void;
    vi.mocked(ensureNotificationSoundSsotHydratedForClient).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveHydrate = resolve;
        })
    );
    vi.mocked(resolveNotificationSound).mockReturnValue({
      eventKey: "messenger_direct_message_received",
      assetId: "DIBAY-SND-010",
      kind: "dibay_default",
      webUrl: "https://cdn.example.com/msg.wav",
      iosSoundName: "default",
      androidChannelId: "dibay_chat_messages_v1",
      vibration: true,
      volume: 0.7,
      repeatCount: 1,
      cooldownSeconds: 0,
      priority: "default",
      enabled: true,
      resolvedFrom: "admin_mapping",
      legacySource: null,
    });
    const playSpy = vi.spyOn(HTMLAudioElement.prototype, "play").mockImplementation(() => Promise.resolve());

    const { invalidatePendingNotificationSoundPlayback } = await import(
      "@/lib/notifications/notification-sound-engine"
    );
    const pending = playEventNotificationSound("messenger_direct_message_received");
    invalidatePendingNotificationSoundPlayback();
    resolveHydrate();
    await pending;
    expect(playSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
  });
});
