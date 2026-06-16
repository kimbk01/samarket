import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("incoming-call native contract", () => {
  it("notification accept uses Activity trampoline (not BroadcastReceiver)", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(src).toContain("PendingIntent.getActivity");
    expect(src).toContain("IncomingCallActivity.ACTION_ACCEPT");
  });

  it("IncomingCallDeclineReceiver does not handle accept", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallDeclineReceiver.java");
    expect(src).not.toContain("ACTION_ACCEPT");
    expect(src).not.toContain("INCOMING_CALL_NOTIFICATION_ACCEPT");
    expect(src).toContain("ACTION_DECLINE");
    expect(src).toContain("handleReject");
  });

  it("native pending route consumption is logged", () => {
    const src = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(src).toContain("pending_route_consumed");
  });

  it("notification accept activity open is logged", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(src).toContain("notification_accept_activity_open");
  });

  it("native plugin exposes markCallConsumed for Web consumed bridge", () => {
    const plugin = read("android/app/src/main/java/com/dibay/app/NativeIncomingCallPlugin.java");
    expect(plugin).toContain("markCallConsumed");
    expect(plugin).toContain("isCallConsumed");
    expect(plugin).toContain("listConsumedCallIds");
    expect(plugin).toContain("drainPendingTerminalEvents");
    expect(plugin).toContain("getForegroundIncomingCallId");
    expect(plugin).toContain("DibayCallConsumedStore.mark");
    const store = read("android/app/src/main/java/com/dibay/app/DibayCallConsumedStore.java");
    expect(store).toContain("isConsumed");
    expect(store).toContain("listConsumed");
  });

  it("native incoming paths block consumed callId before UI or ringtone", () => {
    const activity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const eventGuard = activity.indexOf("DibayCallConsumedStore.isConsumed(this, payload.callId)");
    const eventDispatch = activity.indexOf("window.dispatchEvent(new CustomEvent('dibay:call-event'");
    expect(eventGuard).toBeGreaterThan(-1);
    expect(eventDispatch).toBeGreaterThan(-1);
    expect(eventGuard).toBeLessThan(eventDispatch);

    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(fcm).toContain("DibayCallConsumedStore.isConsumed(this, callId)");
    expect(fcm).toContain("incoming_ignored_consumed");
  });

  it("native duplicate incoming callId returns before notification or foreground event", () => {
    const activity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(activity).toContain("IncomingCallActionCoordinator.registerIncoming(this, payload.callId)");
    expect(activity).toContain("incoming_duplicate_ignored");
    const foregroundDedupe = activity.indexOf("IncomingCallActionCoordinator.registerIncoming(this, payload.callId)");
    const eventDispatch = activity.indexOf("window.dispatchEvent(new CustomEvent('dibay:call-event'");
    expect(foregroundDedupe).toBeLessThan(eventDispatch);

    const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(notification).toContain("boolean firstIncoming = IncomingCallActionCoordinator.registerIncoming(context, sid)");
    expect(notification).toContain("if (!firstIncoming) {\n      return;\n    }");
  });

  it("native incoming register checks consumed store before active duplicate state", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    const consumed = src.indexOf("DibayCallConsumedStore.isConsumed(context, sid)");
    const active = src.indexOf("ACTIVE_INCOMING.putIfAbsent");
    expect(consumed).toBeGreaterThan(-1);
    expect(active).toBeGreaterThan(-1);
    expect(consumed).toBeLessThan(active);
  });

  it("native reject, accept, and missed mark consumed immediately", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(src).toContain('DibayCallConsumedStore.mark(context, sid, "accepted")');
    expect(src).toContain('DibayCallConsumedStore.mark(context, sid, "declined")');
    expect(src).toContain('DibayCallConsumedStore.mark(context, sid, "missed")');
  });

  it("native coordinator PATCHes accept on background thread before direct route", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(src).toContain('CallSessionPatchHelper.patch(app, sid, "accept")');
    expect(src).toContain("accept_route_direct");
    expect(src).toContain("buildMainActivityCallAcceptIntent");
  });

  it("FCM foreground unlocked launches native pill instead of web-only delegate", () => {
    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(fcm).toContain("incoming_call_foreground_native_ui");
    expect(fcm).toContain("IncomingCallForegroundUiLauncher.showUi");
    expect(fcm).toContain("isForegroundUnlockedInteractive");
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).toContain("ForegroundIncomingCallActivity");
  });

  it("IncomingCallTerminalHandler centralizes terminal dismiss, consumed, ring stop, activity finish", () => {
    const handler = read("android/app/src/main/java/com/dibay/app/IncomingCallTerminalHandler.java");
    expect(handler).toContain("dismissIncomingCall");
    expect(handler).toContain("DibayCallConsumedStore.mark");
    expect(handler).toContain("IncomingCallRingOwner.stop");
    expect(handler).toContain("broadcastFinishIncomingActivity");
    expect(handler).toContain("deliverCallTerminalEvent");

    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(fcm).toContain("IncomingCallTerminalHandler.handle");
    expect(fcm).toContain("IncomingCallTerminalHandler.isTerminalPushType");

    const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(activity).toContain("ACTION_TERMINAL");
    expect(activity).toContain("activity_finish_by_terminal");
  });

  it("notification contentIntent uses preview route and accept uses nativeAccept=1", () => {
    const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(notification).toContain("buildMainActivityCallPreviewIntent");
    const helper = read("android/app/src/main/java/com/dibay/app/IncomingCallIntentHelper.java");
    expect(helper).toContain("nativeAccept=1");
    expect(helper).toContain("incomingPreview=1");
  });

  it("debug adb command receiver is debug-only and documents adb actions", () => {
    const debugManifest = read("android/app/src/debug/AndroidManifest.xml");
    expect(debugManifest).toContain("DibayCallDebugCommandReceiver");
    expect(debugManifest).toContain("com.dibay.DEBUG_INCOMING_CALL");
    expect(debugManifest).toContain("com.dibay.DEBUG_CALL_CANCELED");

    const releaseManifest = read("android/app/src/main/AndroidManifest.xml");
    expect(releaseManifest).not.toContain("DibayCallDebugCommandReceiver");
    expect(releaseManifest).not.toContain("DEBUG_INCOMING_CALL");

    const receiver = read("android/app/src/debug/java/com/dibay/app/DibayCallDebugCommandReceiver.java");
    expect(receiver).toContain("IncomingCallTerminalHandler.handle");
    expect(receiver).not.toContain("src/main");
  });

  it("IncomingCallTerminalHandler has Robolectric unit coverage", () => {
    expect(read("android/app/src/test/java/com/dibay/app/IncomingCallTerminalHandlerTest.java")).toContain(
      "IncomingCallTerminalHandler.handle"
    );
    expect(read("android/app/src/test/java/com/dibay/app/DibayFirebaseMessagingServiceTerminalTest.java")).toContain(
      "call_canceled"
    );
  });

  it("Global defers Android foreground banner to native pill with fallback", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("preferNativeAndroidForegroundIncoming");
    expect(global).toContain("nativeForegroundIncomingCallId");
    expect(global).toContain("onForegroundIncomingUi");
  });

  it("notification uses DIBAY incoming action icons and copy helper", () => {
    const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(notification).toContain("IncomingCallUiCopy");
    expect(notification).toContain("ic_dibay_incoming_reject");
    expect(notification).toContain("ic_dibay_incoming_accept");
    expect(read("android/app/src/main/res/values/colors.xml")).toContain("dibay_incoming_primary");
    expect(read("android/app/src/main/res/values/colors.xml")).toContain("#006241");
  });

  it("lock fullscreen applies bottom safe area for navigation bar", () => {
    const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(activity).toContain("IncomingCallUiInsets.applyBottomSafeArea");
    expect(read("android/app/src/main/res/layout/activity_incoming_call.xml")).toContain("incoming_call_actions");
  });

  it("foreground pill uses 440ms enter animation and DIBAY layout", () => {
    const activity = read("android/app/src/main/java/com/dibay/app/ForegroundIncomingCallActivity.java");
    expect(activity).toContain("dibay_incoming_pill_enter");
    expect(read("android/app/src/main/res/anim/dibay_incoming_pill_enter.xml")).toContain("440");
    expect(read("android/app/src/main/res/layout/activity_foreground_incoming_call.xml")).toContain("bg_dibay_incoming_pill");
  });

  it("native plugin proxy is wrapped so Promise resolution does not call .then()", () => {
    const src = read("lib/push/native/push-route-native-bridge.ts");
    expect(src).toContain("NativeIncomingCall.then()");
    expect(src).toContain("return { plugin: registerPlugin<NativeIncomingCallPlugin>");
    expect(src).toContain("(await pluginPromise)?.plugin ?? null");
  });
});

