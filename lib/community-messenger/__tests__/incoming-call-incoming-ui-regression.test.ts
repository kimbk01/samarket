import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { communityMessengerIncomingSessionFromFcmWake } from "@/lib/community-messenger/incoming-call-realtime-preview";
import { resolveIncomingAppForeground } from "@/lib/community-messenger/incoming-call-ui-policy";
import { resolveForegroundIncomingPresentation } from "@/lib/community-messenger/incoming-call/foreground-incoming-presenter";
import { buildCallTombstoneContext } from "@/lib/community-messenger/call-events/fcm-call-event-normalizer";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

const tombstone = buildCallTombstoneContext(new Map());

describe("incoming-call incoming UI regression (ring must pair with UI)", () => {
  it("FCM wake optimistic session has fields required for banner + ring", () => {
    const session = communityMessengerIncomingSessionFromFcmWake("callee", {
      sessionId: "call-1",
      roomId: "room-1",
      callKind: "voice",
      callerId: "caller-1",
      callerName: "Caller",
    });
    expect(session?.sessionMode).toBe("direct");
    expect(session?.status).toBe("ringing");
    expect(session?.recipientUserId).toBe("callee");
    expect(session?.source).toBe("fcm_wake");
  });

  it("Capacitor native appVisible forces foreground even when document hidden", () => {
    expect(
      resolveIncomingAppForeground({
        isCapacitorNative: true,
        visibilityState: "hidden",
        nativeAppForeground: true,
      })
    ).toBe(true);
  });

  it("native APK foreground uses native pill; Web defers banner to native", () => {
    const session = communityMessengerIncomingSessionFromFcmWake("self", {
      sessionId: "call-wake",
      roomId: "room-1",
      callKind: "voice",
      callerId: "caller",
      callerName: "Peer",
    });
    expect(session).not.toBeNull();
    const nativeDecision = resolveForegroundIncomingPresentation({
      sessions: [session!],
      pathname: "/philife",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
      foregroundWakeSessionIds: new Set(["call-wake"]),
      isCapacitorNative: true,
      nativeAppForeground: true,
      preferNativeAndroidForegroundIncoming: true,
    });
    expect(nativeDecision.shouldRender).toBe(false);
    expect(nativeDecision.reason).toBe("native_foreground_primary");

    const webDecision = resolveForegroundIncomingPresentation({
      sessions: [session!],
      pathname: "/philife",
      viewerUserId: "self",
      viewerLiveSessionId: null,
      tombstone,
      incomingTabLeader: true,
      visibilityState: "visible",
      isAppForeground: true,
      foregroundWakeSessionIds: new Set(["call-wake"]),
      isCapacitorNative: false,
      preferNativeAndroidForegroundIncoming: false,
    });
    expect(webDecision.shouldRender).toBe(true);
    expect(webDecision.reason).toBe("ok");
  });

  it("MainActivity foreground delivers native pill + Web session sync (no fake web_banner presented)", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("presentForegroundIncomingCall");
    expect(main).toContain("IncomingCallForegroundUiLauncher.showUi");
    expect(main).toContain("injectCallIncomingWebEvent");
    expect(main).not.toContain('onPresented(payload.callId, "web_banner")');
    expect(main).toContain("roomId:");
    expect(main).toContain("callerId:");
  });

  it("outgoing push payload includes callee wake fields (roomId·callerId·kind)", () => {
    const push = read("lib/push/send-community-messenger-incoming-call-push.ts");
    expect(push).toContain("room_id: roomId");
    expect(push).toContain("caller_id: callerId");
    expect(push).toContain("call_kind: input.callKind");
    expect(push).toContain('notification_type: "community_messenger_incoming_call"');

    const fcmContract = read("lib/push/dispatch/fcm-data-payload-contract.ts");
    expect(fcmContract).toContain('case "incoming_call"');
    expect(fcmContract).toContain("fields.roomId");
    expect(fcmContract).toContain("callerId");
  });

  it("outgoing session create dispatches incoming FCM push to callee", () => {
    const service = read("lib/community-messenger/service.ts");
    expect(service).toContain("sendWebPushForCommunityMessengerIncomingCall");
    expect(service).toContain("recipientUserId:");
    expect(service).toContain("sessionId:");
    expect(service).toContain("roomId:");
    expect(service).toContain("callerId:");

    const nav = read("lib/community-messenger/call-session-navigation-seed.ts");
    expect(nav).toContain("export async function launchOutgoingDirectCall");
  });

  it("MainActivity foreground inject notifies Web + does not skip banner path", () => {
    const launcher = read("android/app/src/main/java/com/dibay/app/IncomingCallForegroundUiLauncher.java");
    expect(launcher).toContain("notifyForegroundIncomingUiState(sid, true)");
    expect(launcher).toContain("source=foreground_activity");
  });

  it("background/lock UI delivers after ringing FGS foreground", () => {
    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    const coordinator = read("android/app/src/main/java/com/dibay/app/IncomingCallRingingCoordinator.java");
    const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    expect(fcm).toContain("IncomingCallRingingCoordinator.startRingingWithPresentation");
    expect(coordinator).toContain("PendingIncomingPresentation.put");
    expect(fgs).toContain("IncomingCallRingingCoordinator.deliverPendingPresentation");
    expect(read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundPresentation.java")).toContain(
      "background_presentation_deliver"
    );
  });

  it("lock IncomingCallActivity has showWhenLocked manifest contract", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain('android:showWhenLocked="true"');
    expect(manifest).toContain('android:turnScreenOn="true"');
    const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(activity).toContain("requestDismissKeyguard");
  });

  it("lock screen launches IncomingCallActivity directly (OEM FSI delay guard)", () => {
    const lock = read("android/app/src/main/java/com/dibay/app/IncomingCallLockUiLauncher.java");
    expect(lock).toContain("incoming_activity_lock_direct_launch");
    expect(lock).toContain("CallActivityRouter.shouldLaunchIncomingActivity");

    const bg = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundPresentation.java");
    expect(bg).toContain("IncomingCallLockUiLauncher.launchIfNeeded");
  });

  it("outside-app UI launches full-screen Activity from ringing FGS (BAL exempt)", () => {
    const outside = read("android/app/src/main/java/com/dibay/app/IncomingCallOutsideAppLauncher.java");
    const bg = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundPresentation.java");
    const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    expect(outside).toContain("outside_app_incoming_activity_launch");
    expect(bg).toContain("IncomingCallOutsideAppLauncher.launchFullScreenIncoming");
    expect(fgs).toContain("IncomingCallRingingCoordinator.deliverPendingPresentation(this, sid)");
  });

  it("lock/background ring uses wake lock + voice communication signalling audio", () => {
    const wake = read("android/app/src/main/java/com/dibay/app/IncomingCallWakeLock.java");
    const ringtone = read("android/app/src/main/java/com/dibay/app/DibayForegroundRingtone.java");
    const coordinator = read("android/app/src/main/java/com/dibay/app/IncomingCallRingingCoordinator.java");
    expect(wake).toContain("incoming_wake_lock_acquired");
    expect(ringtone).toContain("IncomingCallWakeLock.acquire");
    expect(coordinator).toContain("IncomingCallWakeLock.acquire");
  });

  it("lock path delivers UI immediately without waiting for ringing FGS", () => {
    const coordinator = read("android/app/src/main/java/com/dibay/app/IncomingCallRingingCoordinator.java");
    expect(coordinator).toContain("decision.lockBridge");
    expect(coordinator).toContain("deliverPendingPresentation(context.getApplicationContext(), sid)");
    expect(coordinator.indexOf("deliverPendingPresentation")).toBeLessThan(
      coordinator.indexOf("CallForegroundService.startRinging")
    );
  });

  it("presenter decision log surfaces banner block reason (no silent ring-only)", () => {
    const log = read("lib/community-messenger/incoming-call/incoming-presenter-decision-log.ts");
    expect(log).toContain("presenterReason");
    expect(log).toContain("banner_blocked:");
    expect(log).toContain("incomingAppForeground");
  });

  it("app visibility for routing uses resumed activity count (not MainActivity onStart only)", () => {
    const visibility = read("android/app/src/main/java/com/dibay/app/DibayAppVisibility.java");
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(visibility).toContain("hasResumedActivity");
    expect(main).toContain("DibayAppVisibility.hasResumedActivity()");
  });

  it("ring owner is decoupled from banner but Global syncs native foreground for presenter", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    const presenterSrc = read("lib/community-messenger/incoming-call/foreground-incoming-presenter.ts");
    expect(global).toContain("syncNativeIncomingAppForeground");
    expect(global).toContain("isAppForegroundForIncoming");
    expect(global).toContain("resolveIncomingAppForeground");
    expect(global).toContain("foregroundWakeSessionIds");
    expect(presenterSrc).toContain("ok:native_foreground_wake");
  });
});
