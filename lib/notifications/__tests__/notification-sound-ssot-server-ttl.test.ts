/** @vitest-environment node */
/**
 * W1 / A1 guard: the server keeps its existing 60 s snapshot TTL (Owner D1 condition 4).
 * Server freshness comes from `ensureNotificationSoundSsotHydratedForServer` reloading the DB.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationSoundSsotSnapshotOrigin,
  hydrateNotificationSoundSnapshotFromRows,
  invalidateNotificationSoundSsotCache,
  isNotificationSoundSsotClientRefreshRequested,
  resetNotificationSoundSsotSnapshotForTests,
  resolveNotificationSound,
} from "@/lib/notifications/notification-sound-resolver";

const EVENT = "messenger_direct_message_received";
const T0 = new Date("2026-10-05T14:00:00.000Z").getTime();
const URL_A = "https://cdn.example.com/server-admin-a.mp3";

async function hydrateAdmin() {
  await hydrateNotificationSoundSnapshotFromRows({
    assets: [
      {
        id: "DIBAY-CUSTOM-SND-S",
        label: "s.mp3",
        kind: "dibay_custom",
        domain: "messenger_direct",
        file_url: URL_A,
        file_path: null,
        ios_sound_name: null,
        android_channel_base: null,
        legacy_source: null,
        enabled: true,
      },
    ],
    mappings: [
      {
        event_key: EVENT,
        asset_id: "DIBAY-CUSTOM-SND-S",
        use_device_default: false,
        volume: 0.7,
        repeat_count: 1,
        cooldown_seconds: 0,
        vibration_enabled: null,
        priority: null,
        enabled: true,
      },
    ],
  });
}

describe("server snapshot TTL unchanged", () => {
  beforeEach(() => {
    expect(typeof window).toBe("undefined");
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    resetNotificationSoundSsotSnapshotForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetNotificationSoundSsotSnapshotForTests();
  });

  it("serves the hydrated snapshot inside 60 s", async () => {
    await hydrateAdmin();
    vi.setSystemTime(T0 + 59_000);
    expect(resolveNotificationSound(EVENT, { platform: "web" }).webUrl).toBe(URL_A);
  });

  it.each([
    ["61s", 61_000],
    ["5m", 5 * 60_000],
    ["30m", 30 * 60_000],
    ["2h", 120 * 60_000],
  ])("expires to registry after %s until the server hydrate reloads DB", async (_l, elapsed) => {
    await hydrateAdmin();
    vi.setSystemTime(T0 + elapsed);
    expect(resolveNotificationSound(EVENT, { platform: "web" }).webUrl).not.toBe(URL_A);
    expect(getNotificationSoundSsotSnapshotOrigin()).toBe("registry");
  });

  it("invalidate drops the snapshot immediately and never sets the client refresh flag", async () => {
    await hydrateAdmin();
    invalidateNotificationSoundSsotCache();
    expect(resolveNotificationSound(EVENT, { platform: "web" }).webUrl).not.toBe(URL_A);
    expect(isNotificationSoundSsotClientRefreshRequested()).toBe(false);
  });
});
