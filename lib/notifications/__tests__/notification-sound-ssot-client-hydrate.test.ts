/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureNotificationSoundSsotHydratedForClient,
  hydrateNotificationSoundSsotFromApiResponse,
  invalidateNotificationSoundSsotClientHydrate,
  resetNotificationSoundSsotClientHydrateForTests,
} from "@/lib/notifications/notification-sound-ssot-client-hydrate";
import {
  getNotificationSoundSsotSnapshot,
  hydrateNotificationSoundSnapshotFromRows,
  invalidateNotificationSoundSsotCache,
  resolveNotificationSound,
} from "@/lib/notifications/notification-sound-resolver";

describe("notification-sound-ssot-client-hydrate", () => {
  beforeEach(() => {
    resetNotificationSoundSsotClientHydrateForTests();
    invalidateNotificationSoundSsotCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    invalidateNotificationSoundSsotClientHydrate();
    invalidateNotificationSoundSsotCache();
  });

  it("hydrates mapping asset_id from API response into resolver snapshot", async () => {
    const customUrl = "https://cdn.example.com/custom-dm.mp3";
    const ok = await hydrateNotificationSoundSsotFromApiResponse({
      ok: true,
      assets: [
        {
          id: "DIBAY-SND-199",
          label: "custom-dm.mp3",
          kind: "dibay_custom",
          domain: "messenger_direct",
          file_url: customUrl,
          file_path: null,
          ios_sound_name: null,
          android_channel_base: null,
          legacy_source: null,
          enabled: true,
        },
      ],
      events: [],
      mappings: [
        {
          event_key: "messenger_direct_message_received",
          asset_id: "DIBAY-SND-199",
          use_device_default: false,
          volume: 0.8,
          repeat_count: 1,
          cooldown_seconds: 0,
          vibration_enabled: null,
          priority: null,
          enabled: true,
        },
      ],
    });
    expect(ok).toBe(true);

    const resolved = resolveNotificationSound("messenger_direct_message_received", { platform: "web" });
    expect(resolved.assetId).toBe("DIBAY-SND-199");
    expect(resolved.webUrl).toBe(customUrl);
    expect(resolved.resolvedFrom).toBe("admin_mapping");
  });

  it("fetch failure keeps registry fallback snapshot", async () => {
    const before = resolveNotificationSound("messenger_direct_message_received", { platform: "web" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) })
    );

    await ensureNotificationSoundSsotHydratedForClient();

    const after = resolveNotificationSound("messenger_direct_message_received", { platform: "web" });
    expect(after.assetId).toBe(before.assetId);
    expect(fetch).toHaveBeenCalledWith("/api/app/notification-sound-ssot", {
      credentials: "include",
      cache: "no-store",
    });
  });

  it("skips refetch within TTL after successful hydrate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          assets: [],
          events: [],
          mappings: [
            {
              event_key: "messenger_direct_message_received",
              asset_id: "DIBAY-SND-010",
              use_device_default: false,
              volume: 0.7,
              repeat_count: 1,
              cooldown_seconds: 0,
              vibration_enabled: null,
              priority: null,
              enabled: true,
            },
          ],
        }),
      })
    );

    await ensureNotificationSoundSsotHydratedForClient();
    await ensureNotificationSoundSsotHydratedForClient();

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("hydrate merges over registry defaults", () => {
  it("admin mapping overrides default asset for event key", async () => {
    invalidateNotificationSoundSsotCache();
    const registryDefault = resolveNotificationSound("messenger_direct_message_received", {
      platform: "web",
    }).assetId;

    await hydrateNotificationSoundSnapshotFromRows({
      mappings: [
        {
          event_key: "messenger_direct_message_received",
          asset_id: "DIBAY-SND-199",
          use_device_default: false,
          volume: 0.7,
          repeat_count: 1,
          cooldown_seconds: 0,
          vibration_enabled: null,
          priority: null,
          enabled: true,
        },
      ],
      assets: [
        {
          id: "DIBAY-SND-199",
          label: "admin-upload.mp3",
          kind: "dibay_custom",
          domain: "messenger_direct",
          file_url: "https://cdn.example.com/admin-upload.mp3",
          file_path: null,
          ios_sound_name: null,
          android_channel_base: null,
          legacy_source: null,
          enabled: true,
        },
      ],
    });

    const hydrated = resolveNotificationSound("messenger_direct_message_received", { platform: "web" });
    expect(hydrated.assetId).not.toBe(registryDefault);
    expect(hydrated.webUrl).toBe("https://cdn.example.com/admin-upload.mp3");

    const snap = getNotificationSoundSsotSnapshot();
    expect(snap.mappings.get("messenger_direct_message_received")?.asset_id).toBe("DIBAY-SND-199");
  });
});
