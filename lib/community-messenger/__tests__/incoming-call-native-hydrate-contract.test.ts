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
    const lifecycle = read("lib/community-messenger/call-lifecycle.ts");
    expect(lifecycle).toContain("shouldUseWebIncomingRingtone");
    expect(lifecycle).toContain("ring_start_skipped_native_owner");
    expect(lifecycle).toContain('resolveCapacitorShellPlatform() !== "android"');
  });
});

describe("incoming-call direct_ringing cleanup regression", () => {
  it("direct_ringing effect stops ring on cleanup and respects tab leader", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    const idx = global.indexOf('dibayIncomingLaneStartRing(sid, s.callKind, "direct_ringing")');
    expect(idx).toBeGreaterThan(-1);
    const blockStart = global.lastIndexOf("useEffect(() => {", idx);
    const slice = global.slice(blockStart, idx + 400);
    expect(slice).toContain('dibayIncomingLaneStopRing("direct_ringing_cleanup"');
    expect(slice).toContain("if (!incomingTabLeader) return");
    expect(slice).toContain("incomingTabLeader");
  });
});

describe("stale ringing blocked after native tombstone", () => {
  it("FCM/SW wake checks native consumed before optimistic session insert", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("await isCallConsumedIncludingNative(sid)");
    expect(global).toContain('source: "fcm_wake"');
    expect(global).toContain('source: "sw_wake"');
  });

  it("incoming GET refresh hydrates native consumed on Capacitor", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("await hydrateDibayCallConsumedFromNative()");
  });
});
