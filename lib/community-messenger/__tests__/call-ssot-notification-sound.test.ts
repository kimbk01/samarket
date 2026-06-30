/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  callSsotEventKeyForSignal,
  callSsotEventKeyForTone,
  callSsotSignalHasPlayableUrl,
  callSsotToneHasPlayableUrl,
} from "@/lib/community-messenger/call-ssot-notification-sound";
import {
  hydrateNotificationSoundSnapshotFromRows,
  invalidateNotificationSoundSsotCache,
  resolveNotificationSound,
} from "@/lib/notifications/notification-sound-resolver";
import { resetNotificationSoundSsotClientHydrateForTests } from "@/lib/notifications/notification-sound-ssot-client-hydrate";

describe("call-ssot-notification-sound", () => {
  beforeEach(() => {
    resetNotificationSoundSsotClientHydrateForTests();
    invalidateNotificationSoundSsotCache();
  });

  afterEach(() => {
    invalidateNotificationSoundSsotCache();
    resetNotificationSoundSsotClientHydrateForTests();
  });

  it("maps call tone and signal kinds to admin SSOT event keys", () => {
    expect(callSsotEventKeyForTone("incoming", "voice")).toBe("call_incoming_voice");
    expect(callSsotEventKeyForTone("incoming", "video")).toBe("call_incoming_video");
    expect(callSsotEventKeyForTone("outgoing", "voice")).toBe("call_outgoing_voice");
    expect(callSsotEventKeyForSignal("missed")).toBe("call_missed");
    expect(callSsotEventKeyForSignal("rejected")).toBe("call_rejected");
    expect(callSsotEventKeyForSignal("cancelled")).toBe("call_ended");
  });

  it("detects admin-mapped playable URLs for incoming voice and missed call", async () => {
    await hydrateNotificationSoundSnapshotFromRows({
      assets: [
        {
          id: "ADMIN-CALL-IN-V",
          label: "incoming-voice.mp3",
          kind: "dibay_custom",
          domain: "call_voice",
          file_path: null,
          file_url: "https://cdn.example.com/incoming-voice.mp3",
          ios_sound_name: null,
          android_channel_base: "dibay_calls_incoming_v7",
          legacy_source: null,
          enabled: true,
        },
        {
          id: "ADMIN-CALL-MISSED",
          label: "missed.mp3",
          kind: "dibay_custom",
          domain: "call_voice",
          file_path: null,
          file_url: "https://cdn.example.com/missed.mp3",
          ios_sound_name: null,
          android_channel_base: "dibay_calls_incoming_v7",
          legacy_source: null,
          enabled: true,
        },
      ],
      events: [],
      mappings: [
        {
          event_key: "call_incoming_voice",
          asset_id: "ADMIN-CALL-IN-V",
          use_device_default: false,
          volume: 1,
          repeat_count: 1,
          cooldown_seconds: 0,
          vibration_enabled: null,
          priority: null,
          enabled: true,
        },
        {
          event_key: "call_missed",
          asset_id: "ADMIN-CALL-MISSED",
          use_device_default: false,
          volume: 1,
          repeat_count: 1,
          cooldown_seconds: 0,
          vibration_enabled: null,
          priority: null,
          enabled: true,
        },
      ],
    });

    expect(callSsotToneHasPlayableUrl("incoming", "voice")).toBe(true);
    expect(callSsotSignalHasPlayableUrl("missed")).toBe(true);

    const resolved = resolveNotificationSound("call_incoming_voice", { platform: "web" });
    expect(resolved.assetId).toBe("ADMIN-CALL-IN-V");
    expect(resolved.resolvedFrom).toBe("admin_mapping");
    expect(resolved.webUrl).toBe("https://cdn.example.com/incoming-voice.mp3");
  });
});
