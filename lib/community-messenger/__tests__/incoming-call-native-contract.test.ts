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
    expect(plugin).toContain("DibayCallConsumedStore.mark");
    const store = read("android/app/src/main/java/com/dibay/app/DibayCallConsumedStore.java");
    expect(store).toContain("isConsumed");
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

  it("native plugin proxy is wrapped so Promise resolution does not call .then()", () => {
    const src = read("lib/push/native/push-route-native-bridge.ts");
    expect(src).toContain("NativeIncomingCall.then()");
    expect(src).toContain("return { plugin: registerPlugin<NativeIncomingCallPlugin>");
    expect(src).toContain("(await pluginPromise)?.plugin ?? null");
  });
});

