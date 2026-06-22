import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

describe("incoming-call policy contracts", () => {
  it("IncomingCallOverlay entry is used in CallIncomingChrome", () => {
    const chrome = read("components/layout/providers/CallIncomingChrome.tsx");
    expect(chrome).toContain("IncomingCallOverlay");
    expect(chrome).not.toContain("GlobalIncomingCallHost");
    expect(chrome).not.toContain('import("@/components/community-messenger/GlobalIncomingCallHost")');
  });

  it("foreground incoming UI is banner-only (no legacy overlay, no native_auto_fullscreen)", () => {
    const src = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    const host = read("components/community-messenger/ForegroundIncomingCallHost.tsx");
    expect(src).toContain("ForegroundIncomingCallHost");
    expect(src).toContain("resolveForegroundIncomingPresentation");
    expect(host).toContain("IncomingCallBanner");
    expect(src).not.toContain("CommunityMessengerIncomingCallOverlay");
    expect(src).not.toContain("native_auto_fullscreen");
    expect(src).not.toContain("router.replace(\"/community-messenger/calls/");
    expect(src).not.toContain("router.replace(`/community-messenger/calls/");
  });

  it("accept gateway is the only accept PATCH owner", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("acceptIncomingCallOnce");
    // Global may still PATCH for reject or group-call accept, but direct 1:1 accept must not patch here.
    expect(global).not.toContain('patchCommunityMessengerCallSession(session.id, "accept"');
    expect(global).not.toContain('patchCommunityMessengerCallSession(\n              session.id,\n              "accept"');
  });

  it("RouteHost delegates native pending accept to gateway PATCH owner", () => {
    const src = read("components/layout/providers/DibayFcmCallRouteHost.tsx");
    expect(src).toContain("runNativePendingAcceptCall");
    expect(src).not.toContain("markNativeCalleeAcceptPending");
  });

  it("native coordinator is signal-only and delegates accept PATCH to Web", () => {
    const native = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(native).not.toContain("CallSessionPatchHelper.patch");
    expect(native).toContain("accept_signal_sent");
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("nativeAcceptPatchCompleteRoute");
    expect(client).toContain("native_accept_still_ringing");
  });

  it("CallClient blocks callee ringing direct entry without action=accept", () => {
    const src = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(src).toContain("수락 전 자동 `/calls/:id` 진입 차단");
    expect(src).toContain("navigateBackFromCommunityMessengerCall");
    expect(src).toContain("incomingPreviewRoute");
    expect(src).toContain("isIncomingCallPreviewRoute");
  });

  it("CallClient skips duplicate PATCH only when nativeAccept=1 and session active", () => {
    const src = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(src).toContain("nativeAcceptPatchCompleteRoute");
    expect(src).toContain('s.status === "active"');
    expect(src).toContain("nativePrep=1");
  });

  it("RouteHost consumes pending call route on resume", () => {
    const src = read("components/layout/providers/DibayFcmCallRouteHost.tsx");
    expect(src).toContain("visibilitychange");
    expect(src).toContain("maybeConsumeOnResume");
  });

  it("Global patches native notification reject through CallEngine", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain('type: "native_reject"');
    expect(global).toContain("native_notification_reject");
  });

  it("Phase 0 basics flag disables dock pip video upgrade surfaces", () => {
    const basics = read("lib/community-messenger/call-phase0-basics.ts");
    expect(basics).toContain("CM_CALL_PHASE0_BASICS_ONLY");
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("isCmCallDockEnabled");
    expect(client).toContain("isCmCallVideoUpgradeEnabled");
  });

  it("banner expand opens preview route without accept PATCH", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain("expandIncomingCall");
    expect(global).toContain("buildIncomingCallPreviewHref");
    expect(global).toContain("expandIncomingCall(bannerSession)");
    expect(global).not.toMatch(/onExpand=\{[^}]*acceptCall/);
  });

  it("PushRouteListener delegates callee accept to runNativePendingAcceptCall", () => {
    const src = read("components/push/PushRouteListener.tsx");
    expect(src).toContain("runNativePendingAcceptCall");
    expect(src).not.toContain("markNativeCalleeAcceptPending");
  });

  it("MainActivity skips foreground ringtone for consumed callId", () => {
    const src = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(src).toContain("DibayCallConsumedStore.isConsumed");
    expect(src).toContain("incoming_ignored_consumed");
  });

  it("markCallConsumed syncs to native consumed store", () => {
    const state = read("lib/community-messenger/incoming-call-state.ts");
    expect(state).toContain("syncDibayCallConsumedToNative");
    const bridge = read("lib/push/native/dibay-call-consumed-native-bridge.ts");
    expect(bridge).toContain("markCallConsumed");
  });

  it("foreground FCM wake does not start a second WebAudio ringtone", () => {
    const src = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(src).toContain("buildForegroundIncomingWakeOptimisticSession");
    expect(src).not.toContain('dibayIncomingLaneStartRing(sid, detail.callKind ?? "voice", "fcm_wake")');
  });

  it("video prejoin element is hidden until MediaStream is attached", () => {
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("preJoinVideoElementReady ? \"opacity-100\" : \"opacity-0\"");
    const preview = read("components/community-messenger/OutgoingRingCameraPreview.tsx");
    expect(preview).toContain("ready ? \"opacity-100\" : \"opacity-0\"");
  });

  it("Global subscribes session_terminal bus and FCM wake inserts optimistic session", () => {
    const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
    expect(global).toContain('ev.type !== "cm.call.session_terminal"');
    expect(global).toContain("bus_session_terminal");
    expect(global).toContain("buildForegroundIncomingWakeOptimisticSession");
    expect(global).toContain("mergeForegroundIncomingWakeSession");
    expect(global).toContain("onFcmTerminal:");
    const bridge = read("lib/community-messenger/dibay-fcm-call-bridge.ts");
    expect(bridge).toContain("call_terminal");
    expect(bridge).toContain("onFcmTerminal");
    expect(bridge).toContain("dispatchFcmTerminal");
  });

  it("outgoing bootstrap POST requests fresh dial to clear stale ringing sessions", () => {
    const nav = read("lib/community-messenger/call-session-navigation-seed.ts");
    expect(nav).toContain('dialIntent: "fresh"');
    expect(nav).toContain("finalizeOutgoingCallSessionBootstrap");
    expect(nav).toContain("launchOutgoingDirectCall");
    expect(nav).toContain("ensureOutgoingTempCallBootstrap");
    expect(nav).toContain("discardPrimedCommunityMessengerDevicePermission");
    const agoraClient = read("lib/community-messenger/call-provider/client.ts");
    expect(agoraClient).toContain("HTML 링 미리보기용 GUM 은 Agora 마이크로 재사용하지 않는다");
    expect(nav).toContain("buildCommunityMessengerInstantOutgoingCallHref");
    expect(nav).toContain("buildSyntheticTempOutgoingCallSession");
    const http = read("lib/community-messenger/call-http-actions.ts");
    expect(http).toContain('dialIntent: "fresh"');
  });

  it("fresh dial skips caller live-session reuse before terminate", () => {
    const service = read("lib/community-messenger/service.ts");
    expect(service).toContain("if (!isGroupRoom && sb && !dialFresh)");
  });

  it("terminal call end navigates to call_logs section", () => {
    const nav = read("lib/community-messenger/call-session-navigation-seed.ts");
    expect(nav).toContain("COMMUNITY_MESSENGER_CALL_LOGS_HREF");
    expect(nav).toContain("finalizeCommunityMessengerCallTerminalExit");
    const client = read("components/community-messenger/CommunityMessengerCallClient.tsx");
    expect(client).toContain("finalizeCommunityMessengerCallTerminalExit");
    expect(client).toContain("stale_ringing_blocked");
  });
});

