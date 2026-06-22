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
    expect(notification).toContain("IncomingCallActionCoordinator.registerIncoming(context, sid)");
    expect(notification).toContain("incoming_ui_duplicate_blocked");
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

  it("native coordinator is signal-only and does not PATCH accept directly", () => {
    const src = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(src).not.toContain("CallSessionPatchHelper.patch");
    expect(src).toContain("accept_signal_sent");
    expect(src).toContain("buildMainActivityCallAcceptIntent");
  });

  it("FCM foreground unlocked uses web banner SSOT without native pill", () => {
    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(delivery).toContain("incoming_call_foreground_web_ssot");
    expect(delivery).not.toContain("IncomingCallForegroundUiLauncher.showUi");
    expect(delivery).toContain("isForegroundUnlockedInteractive");
    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(fcm).toContain("IncomingCallPushDelivery.deliver");
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

  it("Global keeps Android foreground path on Web banner owner", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("ForegroundIncomingCallHost");
    expect(global).toContain("resolveForegroundIncomingPresentation");
  });

  it("notification posts immediately then enriches avatar async", () => {
    const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(notification).toContain("incoming_posted_immediate");
    expect(notification).toContain("incoming_avatar_enriched");
    const postIdx = notification.indexOf("postNotificationWithFallback");
    const enrichIdx = notification.indexOf("incoming_avatar_enriched");
    expect(postIdx).toBeGreaterThan(-1);
    expect(enrichIdx).toBeGreaterThan(postIdx);
  });

  it("P0 native FCM receive logs priority, Doze grace, ringtone, route, and ack before WebView", () => {
    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(fcm).toContain("logIncomingReceived");
    expect(fcm).toContain("resolveIncomingExpiry");
    expect(fcm).toContain("IncomingCallPushAckHelper.sendAsync");
    expect(fcm).toContain("IncomingCallSessionStatusProbe.shouldProbe");
    expect(fcm).toContain("incoming_late_terminal_blocked");
    expect(fcm).toContain("IncomingCallPushDelivery.deliver");
    expect(fcm).toContain("MainActivity.persistCallPendingRoute");

    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(delivery).toContain("IncomingCallRingOwner.start");
    expect(delivery).toContain("source=push_delivery");

    const log = read("android/app/src/main/java/com/dibay/app/DibayCallPushLog.java");
    expect(log).toContain("[DIBAY_CALL_PUSH]");
    expect(log).toContain("fcm_priority_check");
    expect(log).toContain("doze_delivery_late_detected");
    expect(log).toContain("incoming_expiry_grace_applied");
  });

  it("P0 notification fallback detects blocked channels, FSI, and Activity fallback", () => {
    const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(notification).toContain("dibay_calls_incoming_v7");
    expect(notification).toContain("notification_channel_blocked");
    expect(notification).toContain("notification_permission_denied");
    expect(notification).toContain("full_screen_intent_attached");
    expect(notification).toContain("incoming_notification_posted");
    expect(notification).toContain("incoming_activity_fallback_attempt");
  });

  it("P0 ringing foreground service and native store are cleared on terminal paths", () => {
    const service = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    expect(service).toContain("ACTION_START_RINGING");
    expect(service).toContain("foreground_service_started_ringing");
    expect(service).toContain("foreground_service_stopped_ringing");

    const store = read("android/app/src/main/java/com/dibay/app/DibayIncomingCallNativeStore.java");
    expect(store).toContain("active_incoming_store_set");
    expect(store).toContain("active_incoming_store_clear");

    const terminal = read("android/app/src/main/java/com/dibay/app/IncomingCallTerminalHandler.java");
    expect(terminal).toContain("CallForegroundService.stopRinging");
    expect(terminal).toContain("pending_route_discarded_terminal");
  });

  it("P0 server dispatch carries high-priority incoming call audit and native ack route", () => {
    const payload = read("lib/push/dispatch/fcm-data-payload-contract.ts");
    expect(payload).toContain('fields.action = "incoming_call"');
    expect(payload).toContain("fields.mediaType");
    expect(payload).toContain("fields.ttlMs");
    expect(payload).toContain("fields.priority");

    const sender = read("lib/push/dispatch/fcm-sender-impl.ts");
    expect(sender).toContain('priority: "high"');
    expect(sender).toContain("ttlMs");
    expect(sender).toContain("providerMessageId");

    const dispatch = read("lib/push/dispatch/dispatch-push-for-user.ts");
    expect(dispatch).toContain("push_delivery_diagnostic_missing_device_ack");
    expect(dispatch).toContain("nativeAck");

    const ack = read("app/api/community-messenger/calls/[sessionId]/push-ack/route.ts");
    expect(ack).toContain("nativeAckReceivedAt");
    expect(ack).toContain("sessionStatus");

    const ackHelper = read("android/app/src/main/java/com/dibay/app/IncomingCallPushAckHelper.java");
    expect(ackHelper).toContain("push_ack_terminal_status");
    expect(ackHelper).toContain("IncomingCallTerminalHandler.handle");
  });

  it("notification uses DIBAY CallStyle, brand color, and system action icons in layouts", () => {
    const notification = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    expect(notification).toContain("IncomingCallUiCopy");
    expect(notification).toContain("NotificationCompat.CallStyle.forIncomingCall");
    expect(notification).toContain("dibay_incoming_primary");
    expect(read("android/app/src/main/res/values/colors.xml")).toContain("dibay_incoming_primary");
    expect(read("android/app/src/main/res/values/colors.xml")).toContain("#006241");
    const pill = read("android/app/src/main/res/layout/activity_foreground_incoming_call.xml");
    expect(pill).toContain("@android:drawable/sym_action_call");
    expect(pill).toContain("@android:drawable/ic_menu_close_clear_cancel");
    expect(pill).not.toContain("android:text=\"@string/dibay_incoming_accept\"");
    expect(pill).not.toContain("ic_dibay_incoming_accept");
  });

  it("caller display strips legacy @id suffix in IncomingCallUiCopy", () => {
    const copy = read("android/app/src/main/java/com/dibay/app/IncomingCallUiCopy.java");
    expect(copy).toContain("sanitizeNickname");
    expect(copy).toContain("indexOf(\" (@\")");
  });

  it("avatar URLs are absolutized before native HTTP load", () => {
    const helper = read("android/app/src/main/java/com/dibay/app/IncomingCallAvatarUrl.java");
    expect(helper).toContain("resolveAbsolute");
    expect(read("android/app/src/main/java/com/dibay/app/IncomingCallAvatarHelper.java")).toContain(
      "IncomingCallAvatarUrl.resolveAbsolute"
    );
  });

  it("lock/background activity uses compact top pill (same as in-app banner)", () => {
    const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(activity).toContain("IncomingCallUiInsets.applyTopSafeArea");
    expect(activity).toContain("incoming_call_pill");
    const layout = read("android/app/src/main/res/layout/activity_incoming_call.xml");
    expect(layout).toContain("incoming_call_pill");
    expect(layout).toContain("bg_dibay_incoming_pill");
    expect(layout).not.toContain("incoming_call_center");
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
    expect(src).toContain("NativeIncomingCallPluginRef");
    expect(src).toContain("wrapNativeIncomingCallPlugin");
    expect(src).toContain("return Promise.resolve(ref)");
  });
});

