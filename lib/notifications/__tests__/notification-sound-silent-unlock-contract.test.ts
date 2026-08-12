import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("notification sound silent unlock contract", () => {
  it("TEST 1 — unlock path must not use alert assets or resolver", () => {
    const unlock = read("lib/notifications/notification-sound-unlock.ts");
    expect(unlock).not.toContain("notification.wav");
    expect(unlock).not.toContain("system_default");
    expect(unlock).not.toContain("resolveNotificationSound");
    expect(unlock).not.toContain("NOTIFICATION_SOUND_ASSET_PATH");
    expect(unlock).not.toContain("resolveSsotPrimingUrl");
    expect(unlock).toContain("data:audio/wav");
  });

  it("TEST 2 — unlock path forbids volume > 0", () => {
    const unlock = read("lib/notifications/notification-sound-unlock.ts");
    expect(unlock).toMatch(/\.volume\s*=\s*0\b/);
    expect(unlock).not.toMatch(/\.volume\s*=\s*0\.[1-9]/);
    expect(unlock).not.toMatch(/\.volume\s*=\s*1\b/);
  });

  it("TEST 3 — unlock path forbids muted=false transition", () => {
    const unlock = read("lib/notifications/notification-sound-unlock.ts");
    expect(unlock).not.toContain("muted = false");
    expect(unlock).not.toContain("muted=false");
  });

  it("TEST 4 — route-gated NotificationSoundPrime must not trigger unlock or alert prime", () => {
    const prime = read("components/notifications/NotificationSoundPrime.tsx");
    expect(prime).not.toContain("primeNotificationSoundAudio");
    expect(prime).not.toContain("unlockNotificationSoundAudio");
    expect(prime).not.toContain("playEventNotificationSound");
    expect(prime).not.toContain("resolveNotificationSound");
    expect(prime).toContain("ensureNotificationSoundSsotHydratedForClient");
  });

  it("TEST 5 — route transition does not mount sound occurrence ingest", () => {
    const prime = read("components/notifications/NotificationSoundPrime.tsx");
    const flags = read("lib/layout/conditional-app-shell-flags.ts");
    expect(prime).not.toContain("ingestCanonicalNotificationSound");
    expect(prime).not.toContain("ingestNotificationEventRowSound");
    expect(flags).toMatch(/mountNotificationSoundPrime/);
    expect(flags).not.toMatch(/ingestCanonicalNotificationSound/);
  });

  it("app-lifetime bootstrap owns silent unlock on gesture", () => {
    const bootstrap = read("components/notifications/NotificationSoundLeaderBootstrap.tsx");
    const layout = read("app/layout.tsx");
    expect(layout).toContain("NotificationSoundLeaderBootstrap");
    expect(bootstrap).toContain("unlockNotificationSoundAudio");
    expect(bootstrap).toContain("ensureNotificationSoundRuntimeStarted");
    expect(bootstrap).not.toContain("resolveNotificationSound");
    expect(bootstrap).not.toContain("notification.wav");
  });

  it("deprecated prime shim delegates to silent unlock only", () => {
    const play = read("lib/notifications/play-notification-sound.ts");
    expect(play).toContain("unlockNotificationSoundAudio()");
    expect(play).not.toContain("resolveSsotPrimingUrl");
    expect(play).not.toMatch(/primeNotificationSoundAudio[\s\S]{0,400}resolveNotificationSound/);
  });

  it("event engine logs [sound-event] distinct from unlock", () => {
    const engine = read("lib/notifications/notification-sound-engine.ts");
    expect(engine).toContain('SOUND_EVENT_LOG = "[sound-event]"');
    expect(engine).toContain('source: "event"');
  });
});

describe("NOTIFICATION SOUND HARD LOCK (silent unlock)", () => {
  it("documents eight authority boundaries", () => {
    const doc = read("docs/dibay-notification-sound-silent-unlock-hard-lock.md");
    expect(doc).toContain("Route mount must never generate audible notification sound");
    expect(doc).toContain("Audio unlock must be silent");
    expect(doc).toContain("Unlock must not use alert assets");
    expect(doc).toContain("Only a canonical new event occurrence may request alert playback");
  });
});
