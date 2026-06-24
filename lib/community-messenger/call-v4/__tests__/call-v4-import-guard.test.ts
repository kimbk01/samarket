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

  it("V4 lock incoming uses Telegram fullscreen activity (single visible surface)", () => {
    const notifier = read("android/app/src/main/java/com/dibay/app/IncomingCallBackgroundNotifier.java");
    expect(notifier).toContain("presentV4TelegramFullscreenIncoming");
    expect(notifier).toContain("telegram_fullscreen_launch_start");
    expect(notifier).toContain("lock_presentation_immediate");
    expect(notifier).not.toContain("lock_incoming_fsi_only");
    expect(notifier).not.toContain("_boost");
    expect(notifier).not.toContain("lock_incoming_activity_boost");
  });

  it("V4 ringing FGS notification is always carrier-only in telegram lane", () => {
    const fgs = read("android/app/src/main/java/com/dibay/app/call/CallForegroundService.java");
    const push = read("android/app/src/main/java/com/dibay/app/IncomingCallPushDelivery.java");
    const owner = read("android/app/src/main/java/com/dibay/app/IncomingCallSurfaceOwner.java");
    const main = read("android/app/src/main/java/com/dibay/app/MainActivity.java");
    const coord = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(fgs).toContain("if (CallV4Lane.isTelegramLaneEnabled(this)) return true;");
    expect(push).toContain("tryClaimIncomingOwner(app, callId, initialOwner, \"fcm_push_delivery\")");
    expect(owner).toContain("deliverCallSurfaceOwnerEvent");
    expect(main).toContain("dibay:call-surface-owner");
    expect(coord).toContain("ACCEPTED_TRANSITION");
    const activity = read("android/app/src/main/java/com/dibay/app/IncomingCallActivity.java");
    expect(activity).toContain("finishSafely");
    expect(activity).not.toContain("native_connecting_surface");
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
    expect(notifier).toContain("telegram_fullscreen_launch_start");
    expect(notifier).toContain("notification_fallback");
  });

  it("IncomingCallActionCoordinator uses MainActivity V4 accept not CallScreenActivity", () => {
    const coord = read("android/app/src/main/java/com/dibay/app/IncomingCallActionCoordinator.java");
    expect(coord).toContain("buildMainActivityV4AcceptIntent");
    expect(coord).not.toContain("buildCallScreenActivityIntent");
    expect(coord).not.toContain("call_screen_activity_start");
    expect(coord).toContain("main_activity_v4_accept_start");
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

  it("pure web incoming contract is isolated from native shell", () => {
    const contract = read("lib/community-messenger/call-v4/call-v4-pure-web-incoming-contract.ts");
    expect(contract).toContain("tryClaimCallV4PureWebIncomingOwner");
    expect(contract).not.toContain("IncomingCallSurfaceOwner");
  });

  it("structure lock script exists", () => {
    const script = read("scripts/verify-call-v4-structure-lock.cjs");
    expect(script).toContain("buildIncomingCallPreviewHref");
    expect(script).toContain("resolveSuppressReasonLegacy");
  });
});
