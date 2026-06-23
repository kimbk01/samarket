import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("call-v4 import isolation", () => {
  it("call-v4 modules do not import call-v3 actions or provider", () => {
    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(screen).not.toContain("call-v3-actions");
    expect(screen).not.toContain("CallV3Provider");
    expect(screen).not.toContain("callV3Accept");
    expect(screen).not.toContain("exitCallV3ScreenAfterCleanup");
  });

  it("CallV4Screen logs required Phase 1 markers", () => {
    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(screen).toContain("screen_mounted");
    expect(screen).toContain("connecting_visible");
  });

  it("CallIncomingChrome gates V4 before V3", () => {
    const chrome = read("components/layout/providers/CallIncomingChrome.tsx");
    expect(chrome).toContain("isCallV4TelegramLaneEnabled()");
    expect(chrome).toContain("CallV4IncomingChrome");
    expect(chrome).toMatch(
      /if \(isCallV4TelegramLaneEnabled\(\)\)[\s\S]*?if \(isDibayCallV3SafeLaneEnabled\(\)\)/
    );
  });

  it("PushRouteListener delivers V4 call routes when lane ON", () => {
    const listener = read("components/push/PushRouteListener.tsx");
    expect(listener).toContain("v4_route_delivered");
    expect(listener).toContain("isCallV4CallRoute");
  });

  it("MainActivity suppresses V3 wake/persist when V4 lane ON", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("CallV4Lane.shouldSuppressV3CallReplay");
    expect(main).toContain("v3_wake_route_suppressed");
    expect(main).toContain("v3_pending_route_suppressed");
    expect(main).toContain("v4_foreground_incoming_web_delivered");
  });

  it("CallForegroundService routes FGS accept through coordinator when V4 ON", () => {
    const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    expect(fgs).toContain("resolveRingingNotificationAcceptIntent");
    expect(fgs).toContain("buildCoordinatorAcceptIntent");
    expect(fgs).toContain("v3_task_removed_pending_suppressed");
  });

  it("V4 ringing FGS notification is carrier-only when native/fallback surface owns visible UI", () => {
    const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    const notifier = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java");
    expect(fgs).toContain("shouldUseCarrierOnlyRingingNotification");
    expect(fgs).toContain("fgs_ring_notification_mode");
    expect(fgs).toContain("fgs_ring_actions_suppressed");
    expect(fgs).toContain("owner=fgs_notification existing=native_fsi");
    expect(fgs).toContain("NotificationCompat.CATEGORY_SERVICE");
    expect(fgs).toContain("NotificationCompat.PRIORITY_LOW");
    expect(fgs).toMatch(/if \(carrierOnly\) \{[\s\S]*?return builder\.build\(\);[\s\S]*?\.addAction/);
    expect(notifier).toContain("refreshRingingNotification(context, callId, payload.callType, \"native_fsi_claimed\")");
    expect(notifier).toContain("refreshRingingNotification(context, callId, payload.callType, \"notification_fallback\")");
  });

  it("IncomingCallActionCoordinator uses MainActivity V4 accept not CallScreenActivity", () => {
    const coord = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(coord).toContain("buildMainActivityV4AcceptIntent");
    expect(coord).not.toContain("buildCallScreenActivityIntent");
    expect(coord).not.toContain("call_screen_activity_start");
    expect(coord).toContain("main_activity_v4_accept_start");
  });

  it("CallScreenActivity removed from manifest", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).not.toContain("CallScreenActivity");
  });
});
