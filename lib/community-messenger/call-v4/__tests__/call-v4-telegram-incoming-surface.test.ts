import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT } from "@/lib/community-messenger/call-v4/call-v4-telegram-incoming-surface";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("call-v4 Telegram incoming surface contract", () => {
  it("documents foreground banner vs native fullscreen split", () => {
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.foreground).toBe("web_top_banner");
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.nonForeground).toBe("native_fullscreen_activity");
    expect(CALL_V4_TELEGRAM_INCOMING_SURFACE_CONTRACT.fgsNotification).toBe("carrier_only");
  });

  it("V4 foreground Web uses Telegram-style IncomingCallBanner", () => {
    const sheet = read("components/community-messenger/call-v4/CallV4IncomingSheet.tsx");
    const banner = read("components/messenger/call/IncomingCallBanner.tsx");
    expect(sheet).toContain("IncomingCallBanner");
    expect(banner).toContain("Telegram식 compact 상단 floating card");
    expect(banner).toContain("data-incoming-call-compact-banner");
  });

  it("Android non-foreground uses telegram fullscreen activity only (no lock CallStyle primary)", () => {
    const notifier = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java");
    const telegramMethod =
      notifier.match(/private static void presentV4TelegramFullscreenIncoming[\s\S]*?^  \}/m)?.[0] ?? "";
    expect(notifier).toContain("presentV4TelegramFullscreenIncoming");
    expect(notifier).toContain("telegram_fullscreen_launch_start");
    expect(notifier).toContain("showIncomingCallActionOnly");
    expect(notifier).not.toContain("lock_incoming_fsi_only");
    expect(notifier).not.toContain("_boost");
    expect(telegramMethod).toContain("launchIncomingActivity");
    expect(telegramMethod).toContain("showIncomingCallActionOnly");
    expect(telegramMethod).toMatch(
      /activityLaunched[\s\S]*showIncomingCallActionOnly[\s\S]*telegram_fullscreen_notification_fallback[\s\S]*showIncomingCall/,
    );
  });

  it("foreground push routes to Web only (no native foreground activity launcher in delivery)", () => {
    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(delivery).toContain("incoming_call_foreground_web_ssot");
    expect(delivery).toContain("deliverCallIncomingEvent");
    expect(delivery).not.toContain("IncomingCallForegroundUiLauncher");
    expect(delivery).not.toContain("ForegroundIncomingCallActivity");
  });
});
