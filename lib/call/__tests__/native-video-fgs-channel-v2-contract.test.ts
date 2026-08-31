import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

describe("native video FGS channel CUT3 contract", () => {
  it("uses versioned DEFAULT channel and leaves incoming HIGH channel alone", () => {
    const service = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallService.java"),
      "utf8",
    );
    const incoming = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/nativevideo/NativeVideoCallNotification.java"),
      "utf8",
    );
    const registry = readFileSync(
      join(ROOT, "android/app/src/main/java/com/dibay/app/DibayNotificationChannelRegistry.java"),
      "utf8",
    );

    expect(service).toContain('CHANNEL_ID = "dibay_native_video_call_v2"');
    expect(service).toContain("IMPORTANCE_DEFAULT");
    expect(service).toContain("setOnlyAlertOnce(true)");
    expect(service).toContain("setSilent(true)");
    expect(service).not.toMatch(/new NotificationChannel\(\s*CHANNEL_ID[\s\S]*IMPORTANCE_HIGH/);

    expect(incoming).toContain('CHANNEL_ID = "dibay_native_video_incoming"');
    expect(incoming).toContain("IMPORTANCE_HIGH");

    expect(registry).toContain("dibay_native_video_call_v2");
    expect(registry).toContain("dibay_native_video_incoming");
  });
});
