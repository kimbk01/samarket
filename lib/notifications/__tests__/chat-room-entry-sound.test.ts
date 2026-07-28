/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateChatRoomEntryInAppSound } from "@/lib/notifications/chat-room-entry-sound";
import {
  invalidatePendingNotificationSoundPlayback,
  playEventNotificationSound,
  stopNotificationPlayback,
} from "@/lib/notifications/notification-sound-engine";
import { resolveNotificationSound } from "@/lib/notifications/notification-sound-resolver";
import { ensureNotificationSoundSsotHydratedForClient } from "@/lib/notifications/notification-sound-ssot-client-hydrate";

vi.mock("@/lib/notifications/notification-sound-resolver", () => ({
  resolveNotificationSound: vi.fn(),
  invalidateNotificationSoundSsotCache: vi.fn(),
}));

vi.mock("@/lib/notifications/notification-sound-ssot-client-hydrate", () => ({
  ensureNotificationSoundSsotHydratedForClient: vi.fn().mockResolvedValue(undefined),
  invalidateNotificationSoundSsotClientHydrate: vi.fn(),
}));

describe("invalidateChatRoomEntryInAppSound", () => {
  beforeEach(() => {
    vi.mocked(resolveNotificationSound).mockReset();
    vi.mocked(ensureNotificationSoundSsotHydratedForClient).mockClear();
  });

  it("invalidates pending hydrate so late Admin resolve does not call Audio.play", async () => {
    let resolveHydrate!: () => void;
    vi.mocked(ensureNotificationSoundSsotHydratedForClient).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveHydrate = resolve;
        })
    );
    vi.mocked(resolveNotificationSound).mockReturnValue({
      eventKey: "messenger_direct_message_received",
      assetId: "DIBAY-SND-011",
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

    const pending = playEventNotificationSound("messenger_direct_message_received");
    invalidateChatRoomEntryInAppSound();
    resolveHydrate();
    await pending;
    await new Promise((r) => setTimeout(r, 20));
    expect(playSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
  });

  it("exports same generation contract as invalidatePending + stop", () => {
    expect(typeof invalidatePendingNotificationSoundPlayback).toBe("function");
    expect(typeof stopNotificationPlayback).toBe("function");
    expect(() => invalidateChatRoomEntryInAppSound()).not.toThrow();
  });
});
