import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");

/**
 * A-3 (2026-10-27): Samsung 이 음성 통화를 받을 때 「띠딕」 — 통화 중 알림 채널 v1 이 기본 알림음을 가진 채
 * 만들어져 CONNECTING 첫 게시에 재생됐다. 영상 v2(native-video-fgs-channel-v2-contract)와 같은 무음 채널로.
 */
describe("native voice FGS channel A-3 contract", () => {
  const service = readFileSync(
    join(ROOT, "android/app/src/main/java/com/dibay/app/nativevoice/NativeVoiceCallService.java"),
    "utf8",
  );
  const registry = readFileSync(
    join(ROOT, "android/app/src/main/java/com/dibay/app/DibayNotificationChannelRegistry.java"),
    "utf8",
  );

  it("posts on the versioned silent channel only", () => {
    expect(service).toContain('CHANNEL_ID = "dibay_native_voice_call_v2"');
    expect(service).toContain('LEGACY_CHANNEL_ID = "dibay_native_voice_call"');
    expect(service).not.toMatch(/Builder\(this,\s*LEGACY_CHANNEL_ID\)/);
    expect(service).not.toMatch(/new NotificationChannel\(\s*LEGACY_CHANNEL_ID/);
    expect(service).toMatch(/new NotificationCompat\.Builder\(this,\s*CHANNEL_ID\)/);
  });

  it("channel has no sound/vibration and stays DEFAULT (status-bar chip, no heads-up)", () => {
    const ensure = service.slice(service.indexOf("private void ensureChannel()"));
    expect(ensure).toMatch(/new NotificationChannel\(CHANNEL_ID, "[^"]+", NotificationManager\.IMPORTANCE_DEFAULT\)/);
    expect(ensure).toContain("channel.setSound(null, null)");
    expect(ensure).toContain("channel.enableVibration(false)");
  });

  it("notification is silent; CallStyle hangup and onlyAlertOnce kept", () => {
    expect(service).toContain(".setOnlyAlertOnce(true)");
    expect(service).toContain(".setSilent(true)");
    expect(service).toContain("CallStyle.forOngoingCall(person, hangUpPi)");
  });

  it("channel ensured before startForeground", () => {
    const body = service.slice(service.indexOf("public int onStartCommand"));
    expect(body.indexOf("ensureChannel();")).toBeGreaterThan(-1);
    expect(body.indexOf("ensureChannel();")).toBeLessThan(body.indexOf("startForeground(NOTIFICATION_ID"));
  });

  it("registry classifies v2 as a call channel", () => {
    expect(registry).toContain('CALL_CHANNEL_IDS.add("dibay_native_voice_call_v2")');
  });
});
