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

  it("CallV4Screen logs required Phase 1 markers and native accept handoff", () => {
    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(screen).toContain("screen_mounted");
    expect(screen).toContain("connecting_visible");
    expect(screen).toContain("notifyCallV4WebCallScreenReady");
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

  it("V4 lock incoming launches Activity immediately on FCM (Telegram parity)", () => {
    const notifier = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java");
    const lockFsiMethod =
      notifier.match(/private static void presentV4LockFsiOnlyIncoming[\s\S]*?^  \}/m)?.[0] ?? "";
    const lockImmediateMethod =
      notifier.match(/private static void presentV4LockActivityFirstIncoming[\s\S]*?^  \}/m)?.[0] ?? "";
    const presentLockMethod =
      notifier.match(/public static void presentLockIncoming[\s\S]*?^  \}/m)?.[0] ?? "";
    const presentLockUiMethod =
      notifier.match(/private static void presentLockIncomingUiImmediate[\s\S]*?^  \}/m)?.[0] ?? "";
    expect(notifier).toContain("presentV4LockActivityFirstIncoming");
    expect(notifier).toContain("lock_presentation_immediate");
    expect(notifier).toContain("presentV4LockFsiOnlyIncoming");
    expect(notifier).toContain("lock_incoming_fsi_only");
    expect(notifier).toContain("background_presentation_deliver");
    expect(notifier).toContain("native_notification_fallback");
    expect(notifier).toContain("LOCK_FSI_VISIBILITY_WATCHDOG_MS");
    expect(notifier).toContain("scheduleLockFsiVisibilityWatchdog");
    expect(notifier).toContain("fsi_denied");
    expect(notifier).toContain("fsi_watchdog_timeout");
    expect(notifier).toContain("fallback_notification_posted");
    expect(lockImmediateMethod).toContain("launchIncomingActivity");
    expect(presentLockUiMethod).toContain("lock_fcm_immediate");
    expect(notifier).toContain("onLockIncomingSurfaceInteractive");
    expect(notifier).toContain("lock_surface_interactive");
    expect(notifier).toContain("lock_incoming_notify_fsi_attached");
    expect(notifier).not.toContain("lock_ui_parallel");
    expect(presentLockMethod).not.toContain("PendingIncomingPresentation.put");
    expect(lockFsiMethod).toContain("showIncomingCallFsiBridge");
    expect(lockFsiMethod).toContain("lock_incoming_native_fsi_activity_only");
    expect(lockFsiMethod).not.toContain("launchIncomingActivity");
    expect(notifier).not.toContain("lock_presentation_queued");
    expect(notifier).not.toContain("_boost");
    expect(notifier).not.toContain("lock_incoming_activity_boost");
  });

  it("V4 native_fsi owner suppresses visible CallStyle; fallback owner allows it", () => {
    const builder = read("android/app/src/main/java/com/dibay/app/IncomingCallNotificationBuilder.java");
    const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(builder).toContain("showIncomingCallFsiBridge");
    expect(builder).toContain("shouldBlockVisibleCallStyleForNativeFsiOwner");
    expect(builder).toContain("shouldApplyIncomingCallStyle");
    expect(builder).toContain("shouldAttachIncomingFullScreenIntent");
    expect(builder).toContain("incoming_callstyle_suppressed_native_fsi");
    expect(builder).toContain("cancelVisibleIncomingNotificationAfterActivity");
    expect(builder).not.toContain("showIncomingCallActionOnly");
    expect(builder).not.toContain("applyIncomingNotificationAfterActivityShown");
    expect(builder).not.toContain("shouldPostActionOnlyCarrierAfterActivityShown");
    expect(builder).toContain("incoming_visible_notification_cancelled_after_activity");
    expect(builder).toContain("incoming_fgs_notification_kept");
    expect(builder).toContain("fallback_accept_pi_created");
    expect(activity).toContain("incoming_activity_shown_emit");
    expect(activity).toContain("cancelVisibleIncomingNotificationAfterActivity");
    expect(activity).not.toContain("showIncomingCallActionOnly");
    expect(activity).toContain("incoming_activity_shown_skip_duplicate");
    expect(activity).toContain("ACTIVITY_SHOWN_EMITTED");
    expect(activity).toContain("fallback_accept_action");
    expect(read("android/app/src/main/java/com/dibay/app/IncomingCallDeclineReceiver.java")).toContain(
      "fallback_reject_action",
    );
    expect(read("android/app/src/main/AndroidManifest.xml")).toContain(
      "android.permission.REORDER_TASKS",
    );
  });

  it("V4 ringing FGS notification is always carrier-only in telegram lane", () => {
    const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    const push = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    const owner = read("android/app/src/main/java/com/dibay/app/IncomingCallSurfaceOwner.java");
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const coord = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(fgs).toContain("if (CallV4Lane.isTelegramLaneEnabled(this)) return true;");
    expect(push).toContain("legacy_web_pending_route_detached");
    expect(push).not.toContain("tryClaimIncomingOwner(app, callId, initialOwner, \"fcm_push_delivery\")");
    expect(push).not.toContain("MainActivity.deliverCallIncomingEvent");
    expect(push).not.toContain("incoming_call_foreground_web_ssot");
    expect(owner).toContain("deliverCallSurfaceOwnerEvent");
    expect(main).toContain("dibay:call-surface-owner");
    expect(coord).toContain("ACCEPTED_TRANSITION");
    const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(activity).toContain("finishSafely");
    expect(activity).toContain("accept_path_lock_connecting_handoff");
    expect(activity).toContain("notifyLockSurfaceInteractive");
    expect(activity).toContain("onWindowFocusChanged");
    expect(activity).toContain("native_connecting_surface_shown");
    expect(activity).toContain("enterV4ConnectingMode");
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
    expect(notifier).toContain("presentV4BackgroundActivityFirstIncoming");
    expect(notifier).toContain("background_presentation_deliver");
    expect(notifier).toContain("native_notification_fallback");
    expect(notifier).not.toContain("showIncomingCallActionOnly(context, payload");
  });

  it("IncomingCallActionCoordinator uses MainActivity V4 accept not CallScreenActivity", () => {
    const coord = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(coord).toContain("buildMainActivityV4AcceptIntent");
    expect(coord).not.toContain("buildCallScreenActivityIntent");
    expect(coord).not.toContain("call_screen_activity_start");
    expect(coord).toContain("main_activity_calls_v4_direct_start");
    expect(coord).toContain("native_accept_start");
    expect(coord).toContain("accepted_transition");
  });

  it("V4 native decline PATCH runs without MainActivity reject route", () => {
    const coord = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    const helper = read("android/app/src/main/java/com/dibay/app/IncomingCallRejectPatchHelper.java");
    expect(coord).toContain("IncomingCallRejectPatchHelper.sendAsync");
    expect(coord).not.toContain("buildMainActivityV4RejectIntent");
    expect(helper).toContain("reject_patch_start");
    expect(helper).toContain("reject_patch_done");
    expect(helper).toContain("action\\\":\\\"reject");
  });

  it("incoming visibility treats screen-off app process as background", () => {
    const owner = read("android/app/src/main/java/com/dibay/app/IncomingCallSurfaceOwner.java");
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(owner).toContain("isInteractive(context)");
    expect(main).toContain("isInteractive(app)");
  });

  it("CallScreenActivity removed from manifest", () => {
    const manifest = read("android/app/src/main/AndroidManifest.xml");
    expect(manifest).not.toContain("CallScreenActivity");
  });

  it("iOS V4 surface owner bridge injects dibay:call-surface-owner", () => {
    const bridge = read("ios/App/App/Push/CallV4SurfaceOwnerBridge.swift");
    const voip = read("ios/App/App/Push/VoIPPushRegistry.swift");
    const callkit = read("ios/App/App/Push/CallKitProvider.swift");
    const plugin = read("ios/App/App/Plugins/DibayVoipCallPlugin.swift");
    expect(bridge).toContain("dibay:call-surface-owner");
    expect(bridge).toContain("surface_owner_bridge_injected");
    expect(voip).toContain('owner: "native_fsi"');
    expect(voip).toContain('owner: "terminal"');
    expect(callkit).toContain('owner: "accepted_transition"');
    expect(callkit).toContain('owner: "terminal"');
    expect(plugin).toContain("claimForegroundWebIncomingOwner");
  });

  it("Legacy Web Call establishment removed on Android Capacitor (Track ①)", () => {
    const ssot = read("lib/call/native/legacy-web-call-establishment-removed.ts");
    const provider = read("components/community-messenger/call-v4/CallV4Provider.tsx");
    const page = read("app/(main)/community-messenger/calls-v4/[callId]/page.tsx");
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(ssot).toContain("isLegacyWebCallEstablishmentRemoved");
    expect(provider).toContain("syncOnly");
    expect(provider).toContain("isLegacyWebCallEstablishmentRemoved");
    expect(page).toContain("legacy_web_establishment_removed");
    expect(main).toContain("legacy_web_replay_removed");
  });

  it("pure web incoming contract is isolated from native shell", () => {
    const contract = read("lib/community-messenger/call-v4/call-v4-pure-web-owner.ts");
    expect(contract).toContain("tryClaimCallV4PureWebIncomingOwner");
    expect(contract).not.toContain("IncomingCallSurfaceOwner");
  });

  it("V4 native accept keeps connecting surface until web handoff", () => {
    const handoff = read("lib/community-messenger/call-v4/call-v4-native-connecting-handoff.ts");
    const plugin = read("android/app/src/main/java/com/dibay/app/NativeIncomingCallPlugin.java");
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const exitGuard = read("lib/community-messenger/call-v4/call-v4-exit-guard.ts");
    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(handoff).toContain("web_call_screen_ready");
    expect(handoff).toContain("dibay:call-v4-web-call-screen-ready");
    expect(handoff).toContain("markCallV4WebCallScreenReady");
    expect(plugin).toContain("notifyWebCallScreenReady");
    expect(main).toContain("onWebCallScreenReady");
    expect(main).toContain("main_activity_calls_v4_direct_start");
    expect(main).toContain("accept_route_restore_start");
    expect(main).toContain("accept_route_restore_done");
    expect(main).toContain("accept_route_restore_failed");
    expect(main).toContain("accept_handoff_deferred");
    expect(exitGuard).toContain("cleanup_skipped_until_call_screen_ready");
    expect(exitGuard).toContain("call_screen_ready_before_cleanup");
    expect(exitGuard).toContain("maybeExitCallV4ScreenAfterCleanup");
    expect(screen).toContain("nativeHandoffPhaseRef");
    expect(screen).not.toMatch(
      /notifyCallV4WebCallScreenReady\(callId,\s*phase === "connected"/,
    );
  });

  it("Phase 6A architecture — presentation SSOT + platform adapters (flags OFF by default)", () => {
    expect(read("lib/community-messenger/call-v4/call-v4-phase6-flags.ts")).toContain(
      'process.env.NEXT_PUBLIC_DIBAY_CALL_V4_VIDEO === "1"',
    );
    expect(read("lib/community-messenger/call-v4/call-v4-connected-media-policy.ts")).toContain(
      "canAttachCallV4VideoMedia",
    );
    expect(read("lib/community-messenger/call-v4/presentation/call-v4-presentation-capability.ts")).toContain(
      "android_os_pip",
    );
    expect(read("lib/community-messenger/call-v4/presentation/ios/call-v4-presentation-ios.adapter.ts")).toContain(
      "ios_dock_fallback",
    );
    expect(read("lib/community-messenger/call-v4/presentation/web/call-v4-presentation-web.adapter.ts")).toContain(
      "web_floating_dock",
    );
    expect(read("lib/community-messenger/call-v4/presentation/use-call-v4-presentation-platform.ts")).toContain(
      "useCallV4PresentationPlatform",
    );
    const provider = read("components/community-messenger/call-v4/CallV4Provider.tsx");
    expect(provider).toContain("CallV4ActiveCallHost");
    expect(provider).toContain("useCallV4PresentationPlatform");
    expect(provider).toContain("useCallV4ForegroundResume");
    expect(provider).not.toContain("CommunityMessengerCallClient");
    const host = read("components/community-messenger/call-v4/CallV4ActiveCallHost.tsx");
    expect(host).toContain("supportsCallV4AndroidOsPipBridge");
  });

  it("V4 presentation does not directly access legacy minimized storage keys", () => {
    const presentationFiles = [
      "components/community-messenger/call-v4/CallV4Screen.tsx",
      "lib/community-messenger/call-v4/call-v4-video-presenter.tsx",
      "lib/community-messenger/call-v4/presentation/call-v4-presentation-dock.ts",
      "lib/community-messenger/call-v4/presentation/use-call-v4-runtime-surface.ts",
      "lib/community-messenger/call-v4/presentation/use-call-v4-presentation-platform.ts",
    ];
    for (const file of presentationFiles) {
      const source = read(file);
      expect(source).not.toContain("cm_minimized_call_");
      expect(source).not.toContain("readMinimizedCommunityCallSessionId");
      expect(source).not.toContain("writeMinimizedCommunityCallSession");
    }
  });

  it("structure lock script exists", () => {
    const script = read("scripts/verify-call-v4-structure-lock.cjs");
    expect(script).toContain("buildIncomingCallPreviewHref");
    expect(script).toContain("resolveSuppressReasonLegacy");
    expect(script).toContain("cancelMissedTimeout");
    expect(script).toContain("shouldSuppressMissedTimeout");
    expect(script).toContain("incoming_session_purge_blocked");
    expect(script).toContain("presentV4LockFsiOnlyIncoming");
    expect(script).toContain("presentV4LockActivityFirstIncoming");
    expect(script).toContain("presentV4BackgroundActivityFirstIncoming");
    expect(script).toContain("Policy A lock immediate Activity entry");
    expect(script).toContain("Policy A FSI denied/watchdog fallback");
  });

  it("incoming FSI/fallback manifest bundles Android + QA without cross-domain leak", () => {
    const manifest = JSON.parse(
      read("scripts/call-v4-incoming-fsi-fallback-manifest.json"),
    ) as {
      androidIncoming: string[];
      qaScript: string;
      sessionCleanupCallers: string[];
      policyPresentationOwner: string;
    };
    expect(manifest.androidIncoming).toContain(
      "android/app/src/main/java/com/dibay/app/IncomingCallSessionCleanup.java",
    );
    expect(manifest.sessionCleanupCallers).toEqual(
      expect.arrayContaining([
        "IncomingCallActionCoordinator.java",
        "IncomingCallTerminalHandler.java",
        "IncomingCallBackgroundNotifier.java",
      ]),
    );
    expect(manifest.policyPresentationOwner).toBe("IncomingCallBackgroundNotifier.java");
    const qa = read(manifest.qaScript);
    expect(qa).toContain("BUNDLE: call-v4-incoming-fsi-fallback");
    const boundary = read("scripts/verify-call-v4-incoming-fsi-fallback-boundary.cjs");
    expect(boundary).toContain("call-v4-incoming-fsi-fallback-manifest.json");
  });

  it("call-session-navigation-seed does not statically import call-v4-actions (SSR shell)", () => {
    const nav = read("lib/community-messenger/call-session-navigation-seed.ts");
    expect(nav).not.toMatch(
      /^\s*import\s+\{[^}]*callV4LaunchOutgoingDirectCall[^}]*\}\s+from\s+["']@\/lib\/community-messenger\/call-v4\/call-v4-actions["']/m,
    );
    expect(nav).toContain("@/lib/community-messenger/call-v4/call-v4-actions");
  });

  it("CallIncomingChrome lazy-loads V4 provider and active call host", () => {
    const chrome = read("components/layout/providers/CallIncomingChrome.tsx");
    expect(chrome).not.toMatch(
      /^\s*import\s+\{[^}]*CallV4IncomingChrome[^}]*\}\s+from\s+["']@\/components\/community-messenger\/call-v4\/CallV4Provider["']/m,
    );
    expect(chrome).not.toMatch(
      /^\s*import\s+\{[^}]*CommunityMessengerActiveCallHost[^}]*\}\s+from\s+["']@\/components\/layout\/providers\/CommunityMessengerActiveCallHost["']/m,
    );
    expect(chrome).toContain('ssr: false');
  });

  it("P2-1 PushDelivery legacy Web pending-route paths are detached (DEAD)", () => {
    const push = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    expect(push).toContain("NativeVoiceCallRuntime.handleIncoming");
    expect(push).toContain("NativeVideoCallRuntime.handleIncoming");
    expect(push).toContain("legacy_web_pending_route_detached");
    const deadTokens = [
      "CallV4Lane.isTelegramLaneEnabled",
      "MainActivity.deliverCallIncomingEvent",
      "IncomingCallBackgroundNotifier.presentLockIncoming",
      "tryClaimIncomingOwner",
      "incoming_call_foreground_web_ssot",
      "IncomingCallRingOwner.start",
    ];
    for (const token of deadTokens) {
      expect(push).not.toContain(token);
    }
  });

  it("P2-2 callV4CreateOutgoing Android keeps outgoing presentation while native handoff runs", () => {
    const actions = read("lib/community-messenger/call-v4/call-v4-actions.ts");
    expect(actions).toContain("isAndroidNativeOutgoingShell");
    expect(actions).toContain("native_outgoing_failed");
    expect(actions).toContain("native_establishment_unavailable");
    expect(actions).toContain('routeToCallV4Screen(input.router, created.session.id, "outgoing")');
    expect(actions).toContain('useCallV4Store.getState().setPhase("outgoing_ringing")');
    const androidBlock = actions.match(/if \(isAndroidNativeOutgoingShell\(\)\) \{[\s\S]*?\n    \}/)?.[0] ?? "";
    expect(androidBlock).toContain("native_outgoing_failed");
    expect(androidBlock).not.toContain("resetToIdle");
    expect(androidBlock).not.toContain("outgoingGenericErrorMessage");
  });

  it("Track ③ — Android Legacy dead files removed (HARD LOCK)", () => {
    const deletedFiles = [
      "lib/call/native/native-owned-web-v4-ui-guard.ts",
      "lib/call/__tests__/native-owned-web-v4-ui-guard.test.ts",
      "lib/community-messenger/call-v4/call-v4-pure-web-incoming-contract.ts",
      "lib/community-messenger/call-v4/call-v4-route-leave-dock.ts",
      "lib/community-messenger/call-v4/call-v4-pip-presentation.ts",
      "scripts/verify-call-v4-phase6-android.cjs",
    ];
    for (const file of deletedFiles) {
      expect(() => read(file)).toThrow();
    }

    const provider = read("components/community-messenger/call-v4/CallV4Provider.tsx");
    expect(provider).not.toContain("resolveNativeOwnedWebV4UiBlock");
    expect(provider).not.toContain("native-owned-web-v4-ui-guard");
    expect(provider).not.toContain("router_replace_calls_v4_accept_skipped_native_owned");
    expect(provider).toContain("isLegacyWebCallEstablishmentRemoved");
    expect(provider).toContain("syncOnly");

    const route = read("lib/community-messenger/call-v4/call-v4-route.ts");
    expect(route).toContain("legacy_web_establishment_removed");
    expect(route).toContain("isLegacyWebCallEstablishmentRemoved");

    const resume = read("lib/community-messenger/call-v4/call-v4-foreground-resume.ts");
    expect(resume).not.toContain("native_owned_ui_forbidden");
    expect(resume).not.toContain("peekNativeOwnedWebV4UiBlockSync");

    const screen = read("components/community-messenger/call-v4/CallV4Screen.tsx");
    expect(screen).not.toContain("resolveNativeOwnedWebV4UiBlock");
    expect(screen).not.toContain("webUiAllowed");

    const lockDoc = read("docs/dibay-call-track3-dead-code-cleanup-lock.md");
    expect(lockDoc).toContain("HARD LOCK");
    expect(lockDoc).toContain("Track ③");
  });

  it("P2-4 MainActivity suppresses native-owned Web pending route replay (DEAD paths gated)", () => {
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    expect(main).toContain("native_owned_pending_replay_suppressed");
    expect(main).toContain("shouldSuppressNativeOwnedCallRouteReplay");
    expect(main).toContain("NativeVoiceCallOwner.isNativeOwned");
    expect(main).toContain("NativeVideoCallOwner.isNativeOwned");
    expect(main).toContain("suppressNativeOwnedCallRouteReplayIfNeeded");
    expect(main).toContain("persist_call_pending_route");
    expect(main).toContain("flush_pending_app_path");
    expect(main).toContain("inject_webview_route_js");
    expect(main).not.toMatch(/NativeVoiceCallOwner\.claimNative/);
    expect(main).not.toMatch(/NativeVideoCallOwner\.claimNative/);
  });
});
