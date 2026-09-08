import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

describe("native voice/video incoming silent channel CUT7 duplicate-audible", () => {
  it("voice incoming uses silent HIGH v2 and deletes legacy sounding channel", () => {
    const incoming = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallNotification.java"),
      "utf8",
    );
    const registry = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/DibayNotificationChannelRegistry.java"),
      "utf8",
    );
    expect(incoming).toContain('CHANNEL_ID = "dibay_native_voice_incoming_v2"');
    expect(incoming).toContain('LEGACY_CHANNEL_ID = "dibay_native_voice_incoming"');
    expect(incoming).toContain("IMPORTANCE_HIGH");
    expect(incoming).toContain("setSound(null, null)");
    expect(incoming).toContain("deleteNotificationChannel(LEGACY_CHANNEL_ID)");
    // ensureChannel creates CHANNEL_ID only after setSound(null) on the same channel object
    expect(incoming).toMatch(
      /new NotificationChannel\(\s*CHANNEL_ID[\s\S]*?setSound\(null, null\)[\s\S]*?createNotificationChannel\(channel\)/,
    );
    expect(registry).toContain("dibay_native_voice_incoming_v2");
  });

  it("video incoming uses silent HIGH v2 and deletes legacy sounding channel", () => {
    const incoming = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallNotification.java"),
      "utf8",
    );
    expect(incoming).toContain('CHANNEL_ID = "dibay_native_video_incoming_v2"');
    expect(incoming).toContain("setSound(null, null)");
    expect(incoming).toContain("deleteNotificationChannel(LEGACY_CHANNEL_ID)");
  });
});
