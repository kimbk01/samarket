import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { mergeNotificationSoundSsotForAdmin } from "@/lib/notifications/load-notification-sound-ssot-server";
import { mirrorNotificationSoundToLegacy } from "@/lib/notifications/notification-sound-legacy-mirror";
import {
  NOTIFICATION_SOUND_EVENT_KEYS,
  getRegistryEvent,
} from "@/lib/notifications/notification-sound-registry";
import {
  FILE_URL_MAX,
  validateMappingPatch,
} from "@/lib/notifications/notification-sound-ssot-admin-validation";
import {
  REPEAT_RING_EVENT_KEYS,
  assertRepeatPolicyRegistryIntegrity,
  validateRepeatCountForEvent,
} from "@/lib/notifications/notification-sound-ssot-repeat-policy";
import type { NotificationSoundAssetRow } from "@/lib/notifications/notification-sound-types";

describe("notification-sound-ssot-admin-save", () => {
  it("has no in-memory confirm_token module file", () => {
    const tokenPath = path.join(
      process.cwd(),
      "lib/notifications/notification-sound-ssot-admin-token.ts"
    );
    expect(fs.existsSync(tokenPath)).toBe(false);
  });

  it("mergeNotificationSoundSsotForAdmin returns full registry mappings when DB empty", () => {
    const merged = mergeNotificationSoundSsotForAdmin({ mappings: [] });
    expect(merged.mappings.length).toBe(NOTIFICATION_SOUND_EVENT_KEYS.length);
    expect(merged.events.length).toBe(NOTIFICATION_SOUND_EVENT_KEYS.length);
    for (const key of NOTIFICATION_SOUND_EVENT_KEYS) {
      expect(merged.mappings.some((m) => m.event_key === key)).toBe(true);
    }
  });

  it("merge overlays DB mapping onto registry defaults", () => {
    const merged = mergeNotificationSoundSsotForAdmin({
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
    const row = merged.mappings.find((m) => m.event_key === "messenger_direct_message_received");
    expect(row?.asset_id).toBe("DIBAY-SND-199");
    expect(merged.mappings.length).toBe(NOTIFICATION_SOUND_EVENT_KEYS.length);
  });

  it("validateMappingPatch accepts custom asset from DB lookup", () => {
    const customAsset: NotificationSoundAssetRow = {
      id: "DIBAY-SND-199",
      label: "custom.mp3",
      kind: "dibay_custom",
      domain: "messenger_direct",
      file_path: null,
      file_url: "https://cdn.example.com/custom.mp3",
      ios_sound_name: null,
      android_channel_base: null,
      legacy_source: null,
      enabled: true,
    };
    const result = validateMappingPatch(
      {
        event_key: "messenger_direct_message_received",
        asset_id: "DIBAY-SND-199",
      },
      {
        validAssetIds: new Set(["DIBAY-SND-199"]),
        assetsById: new Map([["DIBAY-SND-199", customAsset]]),
      }
    );
    expect(result.ok).toBe(true);
  });

  it("rejects file_url longer than 4096 chars", () => {
    const longUrl = `https://cdn.example.com/${"a".repeat(FILE_URL_MAX)}`;
    const asset: NotificationSoundAssetRow = {
      id: "DIBAY-SND-199",
      label: "long",
      kind: "dibay_custom",
      domain: "messenger_direct",
      file_path: null,
      file_url: longUrl,
      ios_sound_name: null,
      android_channel_base: null,
      legacy_source: null,
      enabled: true,
    };
    const result = validateMappingPatch(
      {
        event_key: "messenger_direct_message_received",
        asset_id: "DIBAY-SND-199",
      },
      {
        validAssetIds: new Set(["DIBAY-SND-199"]),
        assetsById: new Map([["DIBAY-SND-199", asset]]),
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("file_url_too_long");
      expect(result.max).toBe(4096);
    }
  });

  it("rejects cooldown_seconds above 600", () => {
    const ev = getRegistryEvent("messenger_direct_message_received");
    expect(ev).toBeDefined();
    const assetId = ev!.default_asset_id;
    const result = validateMappingPatch(
      {
        event_key: "messenger_direct_message_received",
        asset_id: assetId,
        cooldown_seconds: 601,
      },
      {
        validAssetIds: new Set([assetId]),
        assetsById: new Map(),
      }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("invalid cooldown_seconds");
      expect(result.field).toBe("cooldown_seconds");
    }
  });

  it("blocks repeat_count > 1 for once events", () => {
    const result = validateRepeatCountForEvent("messenger_direct_message_received", 2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("repeat_not_allowed_for_once_event");
    }
  });

  it("allows repeat_count 3 for repeat ring events", () => {
    const result = validateRepeatCountForEvent("call_incoming_voice", 3);
    expect(result.ok).toBe(true);
  });

  it("allows repeat_count 1 for repeat ring events (legacy default)", () => {
    const result = validateRepeatCountForEvent("call_incoming_voice", 1);
    expect(result.ok).toBe(true);
  });

  it("validates registry default mapping patch", () => {
    const ev = getRegistryEvent("trade_chat_message_received");
    expect(ev).toBeDefined();
    const result = validateMappingPatch(
      {
        event_key: ev!.event_key,
        asset_id: ev!.default_asset_id,
        repeat_count: 1,
        volume: 0.7,
      },
      {
        validAssetIds: new Set([ev!.default_asset_id]),
        assetsById: new Map(),
      }
    );
    expect(result.ok).toBe(true);
  });

  it("mirror throws legacy_mirror_failed when upsert fails", async () => {
    const sb = {
      from: vi.fn((table: string) => {
        if (table === "notification_sound_assets") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { file_url: "https://cdn.example.com/a.mp3", file_path: null },
                }),
              }),
            }),
          };
        }
        if (table === "admin_notification_settings") {
          return {
            upsert: async () => ({ error: { message: "db down" } }),
          };
        }
        return {
          upsert: async () => ({ error: null }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }),
    };

    await expect(
      mirrorNotificationSoundToLegacy(sb as never, [
        {
          event_key: "messenger_direct_message_received",
          asset_id: "DIBAY-SND-011",
          enabled: true,
        },
      ])
    ).rejects.toThrow(/legacy_mirror_failed:admin_notification_settings:db down/);
  });

  it("REPEAT_RING_EVENT_KEYS are subset of registry", () => {
    assertRepeatPolicyRegistryIntegrity();
    for (const key of REPEAT_RING_EVENT_KEYS) {
      expect(NOTIFICATION_SOUND_EVENT_KEYS).toContain(key);
    }
  });
});
