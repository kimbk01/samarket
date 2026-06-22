import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("incoming-call native hydrate contract", () => {
  it("native plugin exposes consumed hydrate and terminal drain APIs", () => {
    const plugin = read("android/app/src/main/java/com/dibay/app/NativeIncomingCallPlugin.java");
    expect(plugin).toContain("isCallConsumed");
    expect(plugin).toContain("listConsumedCallIds");
    expect(plugin).toContain("drainPendingTerminalEvents");
    expect(plugin).toContain("DibayCallConsumedStore.listConsumed");
    expect(plugin).toContain("DibayCallTerminalPendingQueue.drain");
  });

  it("DibayCallConsumedStore lists non-expired tombstones for Web hydrate", () => {
    const store = read("android/app/src/main/java/com/dibay/app/DibayCallConsumedStore.java");
    expect(store).toContain("listConsumed");
    expect(store).toContain("consumedReason");
  });

  it("terminal pending queue enqueues when WebView unavailable", () => {
    const queue = read("android/app/src/main/java/com/dibay/app/DibayCallTerminalPendingQueue.java");
    expect(queue).toContain("terminal_queued");
    expect(queue).toContain("terminal_queue_drained");

    const activity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(activity).toContain("DibayCallTerminalPendingQueue.enqueue");
    expect(activity).toContain("scheduleFlushPendingTerminalEvents");
    expect(activity).toContain("terminal_drained");
  });

  it("Web bridge hydrates native tombstones without native re-sync loop", () => {
    const bridge = read("lib/push/native/dibay-call-consumed-native-bridge.ts");
    expect(bridge).toContain("hydrateDibayCallConsumedFromNative");
    expect(bridge).toContain("isCallConsumedIncludingNative");
    expect(bridge).toContain("drainPendingTerminalEventsFromNative");
    expect(bridge).toContain("markCallConsumedFromNativeHydrate");

    const state = read("lib/community-messenger/incoming-call-state.ts");
    expect(state).toContain("markCallConsumedFromNativeHydrate");
    expect(state).not.toMatch(/markCallConsumedFromNativeHydrate[\s\S]{0,200}syncDibayCallConsumedToNative/);
  });

  it("Global syncs native state on mount and app resume", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("syncNativeIncomingCallState");
    expect(global).toContain("hydrateDibayCallConsumedFromNative");
    expect(global).toContain("drainPendingTerminalEventsFromNative");
    expect(global).toContain('appStateChange');
    expect(global).toContain("isCallConsumedIncludingNative");
  });
});

describe("incoming-call ring ownership contract", () => {
  it("Android Capacitor skips WebAudio incoming ring (native owner)", () => {
    const ringOwner = read("lib/community-messenger/incoming-call/ring-owner.ts");
    expect(ringOwner).toContain("ring_start_native_web_sync");
    expect(ringOwner).toContain("startNativeIncomingRingtoneFireAndForget");
    expect(ringOwner).toContain('resolveCapacitorShellPlatform() === "android"');
    expect(ringOwner).toContain("must not blind-stop native ring");
    expect(ringOwner).toContain("stopNativeIncomingRingtoneFireAndForget");
  });

  it("IncomingCallPushDelivery centralizes push ring + surface routing", () => {
    const delivery = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(delivery).toContain("IncomingCallRingOwner.start");
    expect(delivery).toContain("source=push_delivery");
    expect(delivery).toContain("incoming_call_foreground_web_ssot");
    expect(delivery).not.toContain("IncomingCallForegroundUiLauncher.showUi");
    expect(delivery).toContain("presentLockIncoming");

    const fcm = read("android/app/src/main/java/com/dibay/app/DibayFirebaseMessagingService.java");
    expect(fcm).toContain("IncomingCallPushDelivery.deliver");

    const debug = read("android/app/src/debug/java/com/dibay/app/DibayCallDebugCommandReceiver.java");
    expect(debug).toContain("IncomingCallPushDelivery.deliver");
  });

  it("IncomingCallRingOwner centralizes native foreground ring start/stop", () => {
    const owner = read("android/app/src/main/java/com/dibay/app/IncomingCallRingOwner.java");
    expect(owner).toContain("DibayCallConsumedStore.isConsumed");
    expect(owner).toContain("ring_deduped");
    const activity = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(activity).not.toContain("IncomingCallRingOwner.start");
    expect(activity).not.toContain("DibayForegroundRingtone.start");
  });
});

describe("incoming-call direct_ringing cleanup regression", () => {
  it("direct_ringing uses syncIncomingCallRing with tombstone (no cleanup restart)", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("syncIncomingCallRing");
    expect(global).toContain("canShowIncoming");
    expect(global).not.toContain('dibayIncomingLaneStopRing("direct_ringing_cleanup"');
    expect(global).not.toContain('dibayIncomingLaneStartRing(sid, s.callKind, "direct_ringing")');
  });
});

describe("stale ringing blocked after native tombstone", () => {
  it("FCM/SW wake checks native consumed before optimistic session insert", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("resolveIncomingCallWake");
    expect(global).toContain("isCallConsumedIncludingNative");
    expect(global).toContain('source: "fcm_wake"');
    expect(global).toContain('source: "sw_wake"');
  });

  it("incoming GET refresh hydrates native consumed on Capacitor", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("hydrateDibayCallConsumedFromNative(hardClearedIncomingSessionsAtRef.current)");
  });
});
