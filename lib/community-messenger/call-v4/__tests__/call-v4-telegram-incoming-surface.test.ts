import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CALL_V4_SURFACE_OWNER_KINDS, CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT } from "@/lib/community-messenger/call-v4/call-v4-telegram-incoming-surface";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("call-v4 Telegram incoming surface contract", () => {
  it("documents foreground banner vs native fullscreen split", () => {
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.foreground).toBe("web_top_banner");
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.nonForeground).toBe("native_activity_or_callstyle_fallback");
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.fgsNotification).toBe("carrier_only");
  });

  it("V4 foreground Web uses Telegram-style IncomingCallBanner", () => {
    const sheet = read("components/community-messenger/call-v4/CallV4IncomingSheet.tsx");
    const banner = read("components/messenger/call/IncomingCallBanner.tsx");
    expect(sheet).toContain("IncomingCallBanner");
    expect(banner).toContain("Telegram식 compact 상단 floating card");
    expect(banner).toContain("data-incoming-call-compact-banner");
  });

  it("Android A/B/C policy: lock Activity immediate, background Activity+verify, foreground Web block", () => {
    const notifier = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java");
    const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    const lockFsiMethod =
      notifier.match(/private static void presentV4LockFsiOnlyIncoming[\s\S]*?^  \}/m)?.[0] ?? "";
    const lockImmediateMethod =
      notifier.match(/private static void presentV4LockActivityFirstIncoming[\s\S]*?^  \}/m)?.[0] ?? "";
    const backgroundMethod =
      notifier.match(/private static void presentV4BackgroundActivityFirstIncoming[\s\S]*?^  \}/m)?.[0] ?? "";

    expect(notifier).toContain("presentV4LockActivityFirstIncoming");
    expect(notifier).toContain("lock_presentation_immediate");
    expect(notifier).toContain("presentV4LockFsiOnlyIncoming");
    expect(notifier).toContain("lock_incoming_fsi_only");
    expect(notifier).toContain("scheduleLockFsiVisibilityWatchdog");
    expect(notifier).toContain("fsi_denied");
    expect(notifier).toContain("fsi_watchdog_timeout");
    expect(notifier).toContain("presentV4BackgroundActivityFirstIncoming");
    expect(notifier).toContain("scheduleLaunchVisibilityVerify");
    expect(notifier).toContain("launch_unverified_fallback");
    expect(notifier).toContain("foreground_web_ssot");
    expect(notifier).not.toContain("presentV4ActivityFirstIncoming");
    expect(notifier).not.toContain("_boost");

    expect(lockImmediateMethod).toContain("launchIncomingActivity");
    expect(lockFsiMethod).toContain("showIncomingCallFsiBridge");
    expect(lockFsiMethod).toContain("lock_incoming_native_fsi_activity_only");
    expect(lockFsiMethod).not.toContain("launchIncomingActivity");

    expect(backgroundMethod).toContain("launchIncomingActivity");
    expect(backgroundMethod).toContain("scheduleLaunchVisibilityVerify");
    expect(backgroundMethod).toContain("awaiting=incoming_activity_shown");
    expect(backgroundMethod).not.toContain("showIncomingCall");
    expect(backgroundMethod).not.toMatch(
      /launchAttempted[\s\S]*transitionIncomingOwner[\s\S]*refreshRingingNotification/
    );

    expect(activity).toContain("cancelVisibleIncomingNotificationAfterActivity");
    expect(activity).not.toContain("showIncomingCallActionOnly");
    expect(activity).toContain("onIncomingActivityShown");
    expect(activity).toContain("isWebInAppOwner");
  });

  it("documents shared surface owner kinds", () => {
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.foreground).toBe("web_top_banner");
    expect(CALL_V4_SURFACE_OWNER_KINDS).toContain("unknown_pending");
  });

  it("CallV4IncomingSheet expand uses V4 preview route not V3", () => {
    const sheet = read("components/community-messenger/call-v4/CallV4IncomingSheet.tsx");
    const route = read("lib/community-messenger/call-v4/call-v4-route.ts");
    expect(sheet).toContain("buildCallV4IncomingPreviewHref");
    expect(sheet).not.toContain("buildIncomingCallPreviewHref");
    expect(route).toContain("/community-messenger/calls-v4/");
  });

  it("foreground push routes to Web only (no native foreground activity launcher in delivery)", () => {
    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(delivery).toContain("incoming_call_foreground_web_ssot");
    expect(delivery).toContain("deliverCallIncomingEvent");
    expect(delivery).not.toContain("IncomingCallForegroundUiLauncher");
    expect(delivery).not.toContain("ForegroundIncomingCallActivity");
  });
});
