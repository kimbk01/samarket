/**
 * App Icon Badge HARD LOCK — Android single summary carrier SSOT (static).
 * Domain children must not carry absolute appIconTotal via setNumber.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const FCM =
  "android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java";
const ADAPTER =
  "android/app/src/main/java/com/dibay/app/DibayAppIconDeliveryAdapter.java";
const IOS_ADAPTER = "ios/App/App/Plugins/DibayAppIconDeliveryAdapter.swift";

describe("Android App Icon summary single-carrier contract", () => {
  const fcm = read(FCM);
  const adapter = read(ADAPTER);
  const ios = read(IOS_ADAPTER);

  it("domain child must not setNumber(appIconTotal/badgeCount)", () => {
    expect(fcm).not.toContain("setNumber(badgeCount)");
    expect(fcm).toContain("setNumber(0)");
    expect(fcm).toContain("onDomainNotificationPosted");
  });

  it("summary adapter is sole setNumber(total) carrier with fixed id", () => {
    expect(adapter).toContain('SUMMARY_CHANNEL_ID = "dibay_app_icon_summary_v1"');
    expect(adapter).toContain("SUMMARY_NOTIFICATION_ID = 710001");
    expect(adapter).toContain("setNumber(total)");
    expect(adapter).toMatch(/nm\.notify\(\s*SUMMARY_NOTIFICATION_ID/);
    const setNumberHits = adapter.match(/\.setNumber\(/g) ?? [];
    expect(setNumberHits.length).toBe(1);
  });

  it("domain tray must not cancel summary (no domain_tray_present early exit)", () => {
    expect(adapter).not.toContain("domain_tray_present");
    expect(adapter).not.toMatch(
      /hasActiveDomainNotification[\s\S]{0,200}cancelSummary/
    );
    expect(adapter).toContain("summary_applied");
    expect(adapter).toContain("summary_cleared");
  });

  it("total==0 clears summary only; onDomain posts apply summary", () => {
    expect(adapter).toContain("if (n <= 0)");
    expect(adapter).toContain("summary_cleared total=0");
    expect(adapter).toMatch(
      /onDomainNotificationPosted\([\s\S]*?\)\s*\{\s*apply\(context,\s*appIconTotal\);/
    );
  });

  it("forbids OEM hardcode and total division", () => {
    const banned = [
      "xiaomi",
      "miui",
      "samsung",
      "oneui",
      "notificationCount",
      "total /",
      "total/",
    ];
    const hay = `${adapter}\n${fcm}`.toLowerCase();
    for (const b of banned) {
      expect(hay.includes(b.toLowerCase())).toBe(false);
    }
  });

  it("iOS badge adapter path unchanged (setBadgeCount)", () => {
    expect(ios).toContain("setBadgeCount");
    expect(ios).toContain("applicationIconBadgeNumber");
  });

  it("does not pull Bell/Sound/Call/Register into adapter", () => {
    for (const ban of [
      "BellUnread",
      "playDomainNotificationSound",
      "NativeCallService",
      "register_user_device",
      "notification-bell",
    ]) {
      expect(adapter).not.toContain(ban);
    }
  });
});

