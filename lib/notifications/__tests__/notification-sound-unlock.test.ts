/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNotificationSoundUnlocked,
  resetNotificationSoundUnlockForTests,
  unlockNotificationSoundAudio,
} from "@/lib/notifications/notification-sound-unlock";

describe("unlockNotificationSoundAudio", () => {
  beforeEach(() => {
    resetNotificationSoundUnlockForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetNotificationSoundUnlockForTests();
    vi.restoreAllMocks();
  });

  it("uses silent data URI with muted=true and volume=0", () => {
    const playSpy = vi.spyOn(HTMLAudioElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const audioInstances: HTMLAudioElement[] = [];
    const OrigAudio = globalThis.Audio;
    vi.spyOn(globalThis, "Audio").mockImplementation(function AudioMock(this: HTMLAudioElement, src?: string) {
      const a = new OrigAudio();
      if (src) a.src = src;
      audioInstances.push(a);
      return a;
    });

    unlockNotificationSoundAudio();

    expect(isNotificationSoundUnlocked()).toBe(true);
    expect(audioInstances.length).toBeGreaterThanOrEqual(1);
    const silent = audioInstances[0]!;
    expect(silent.src).toContain("data:audio/wav");
    expect(silent.muted).toBe(true);
    expect(silent.volume).toBe(0);
    expect(playSpy).toHaveBeenCalled();
    expect(silent.src).not.toContain("notification.wav");

    unlockNotificationSoundAudio();
    expect(globalThis.Audio).toHaveBeenCalledTimes(1);
  });

  it("is idempotent per WebView session", () => {
    const audioSpy = vi.spyOn(globalThis, "Audio");
    vi.spyOn(HTMLAudioElement.prototype, "play").mockImplementation(() => Promise.resolve());
    unlockNotificationSoundAudio();
    unlockNotificationSoundAudio();
    expect(isNotificationSoundUnlocked()).toBe(true);
    expect(audioSpy).toHaveBeenCalledTimes(1);
  });
});
