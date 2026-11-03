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
    // 2026-11-04 B7: 숫자 표시 런처는 앱 알림마다 max(1, number) 를 합산 → 요약 카드 number = 총수 − 알림창 일반
    // 알림 몫 (docs/audit/app-icon-badge-plus1-proof-and-design-2026-11-04.md). 런처 숫자 저장소는 총수 그대로.
    expect(adapter).toContain("setNumber(summaryNumber)");
    expect(adapter).toContain("summaryNumberFor(n, tray)");
    expect(adapter).toContain("applyLauncherBadgeProvider(app, n)");
    expect(adapter).toMatch(/id == SUMMARY_NOTIFICATION_ID \|\| id == excludedNotificationId/);
    expect(adapter).toContain("FLAG_ONGOING_EVENT");
    expect(adapter).toMatch(/nm\.notify\(\s*SUMMARY_NOTIFICATION_ID/);
    const setNumberHits = adapter.match(/\.setNumber\(/g) ?? [];
    expect(setNumberHits.length).toBe(1);
  });

  it("summary carrier survives tap/open (AutoCancel false; only apply(0) clears)", () => {
    expect(adapter).toContain("setAutoCancel(false)");
    expect(adapter).not.toContain("setAutoCancel(true)");
    expect(adapter).toContain("summary_cleared total=0");
  });

  it("domain tray must not cancel summary (no domain_tray_present early exit)", () => {
    expect(adapter).not.toContain("domain_tray_present");
    expect(adapter).not.toMatch(
      /hasActiveDomainNotification[\s\S]{0,200}cancelSummary/
    );
    expect(adapter).toContain("summary_applied");
    expect(adapter).toContain("summary_cleared");
  });

  it("total==0 clears summary only; onDomain ignores FCM numeric hint", () => {
    expect(adapter).toContain("if (n <= 0)");
    expect(adapter).toContain("summary_cleared total=0");
    // Gate 3.5: send-time badgeCount is hint only — launcher authority is NativeBadgeSync → apply(A+B).
    expect(adapter).toContain("fcm_hint_ignored");
    expect(adapter).toMatch(
      /onDomainNotificationPosted\([\s\S]*?\)\s*\{\s*Log\.i\(TAG,\s*"fcm_hint_ignored/
    );
    expect(adapter).not.toMatch(
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

