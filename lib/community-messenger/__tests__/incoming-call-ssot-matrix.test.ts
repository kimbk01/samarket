import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("incoming-call SSOT matrix (native)", () => {
  it("IncomingCallRouteDecision logs surface selection", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallRouteDecision.java");
    expect(src).toContain("incoming_route_decision");
    expect(src).toContain("FOREGROUND_BANNER");
    expect(src).toContain("INCOMING_ACTIVITY");
    expect(src).toContain("CALLSTYLE_FALLBACK");
    expect(src).toContain("shouldLaunchDirectIncomingActivity");
  });

  it("ring SSOT — silent v4 channel, no DEFAULT_ALL, RingOwner logs", () => {
    const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(notification).toContain("dibay_calls_incoming_v5");
    expect(notification).toContain("setSound(null, null)");
    expect(notification).not.toContain("DEFAULT_ALL");
    expect(notification).toContain("DEFAULT_VIBRATE");
    expect(notification).toContain("setSilent(true)");
    expect(notification).toContain("ring_owner_decision");
    expect(notification).toContain("notificationSound=disabled");

    const ringOwner = read("android/app/src/main/java/com/dibay/app/IncomingCallRingOwner.java");
    expect(ringOwner).toContain("logRingOwnerDecision");
  });

  it("UI SSOT — FSI primary suppresses CallStyle on same notification", () => {
    const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(notification).toContain("useFsiPrimary");
    expect(notification).toContain("useCallStylePrimary");
    expect(notification).toContain("callstyle_suppressed=true");
    expect(notification).toContain("incoming_ui_surface");
    expect(notification).toContain("duplicateSuppressed=");
    const fsiBlock = notification.indexOf("useFsiPrimary");
    const callStyleBlock = notification.indexOf("CallStyle.forIncomingCall");
    expect(fsiBlock).toBeGreaterThan(-1);
    expect(callStyleBlock).toBeGreaterThan(-1);
    expect(notification.indexOf("useCallStylePrimary", fsiBlock)).toBeGreaterThan(fsiBlock);
  });

  it("FCM uses route decision and foreground native pill path", () => {
    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(fcm).toContain("IncomingCallRouteDecision.resolve");
    expect(fcm).toContain("incoming_call_foreground_native_pill");
    expect(fcm).toContain("MainActivity.deliverCallIncomingEvent");
    expect(fcm).toContain("IncomingCallRingingCoordinator.startRingingWithPresentation");
    const bg = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundPresentation.java");
    expect(bg).toContain("shouldLaunchDirectIncomingActivity");
    expect(bg).toContain("IncomingCallLockUiLauncher.launchIfNeeded");
  });

  it("action guard and cleanup structured logs exist", () => {
    const coordinator = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(coordinator).toContain("incoming_action_guard");
    expect(coordinator).toContain("incoming_cleanup");

    const terminal = read("android/app/src/main/java/com/dibay/app/IncomingCallTerminalHandler.java");
    expect(terminal).toContain("IncomingCallSessionMachine.logIncomingCleanup");
  });

  it("Capacitor APK defers Web banner to native foreground pill", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("preferNativeAndroidForegroundIncoming: isCapacitorNativePlatform()");
  });
});
