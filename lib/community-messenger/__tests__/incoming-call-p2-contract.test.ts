import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

const ANDROID = "android/app/src/main/java/com/dibay/app";

describe("incoming-call P2 contract (frozen SSOT)", () => {
  const sessionMachine = read(`${ANDROID}/IncomingCallSessionMachine.java`);
  const terminal = read(`${ANDROID}/IncomingCallTerminalHandler.java`);
  const probe = read(`${ANDROID}/IncomingCallSessionStatusProbe.java`);
  const plugin = read(`${ANDROID}/NativeIncomingCallPlugin.java`);
  const coordinator = read(`${ANDROID}/IncomingCallActionCoordinator.java`);
  const cleanupReason = read(`${ANDROID}/IncomingCallCleanupReason.java`);
  const ringOwner = read(`${ANDROID}/IncomingCallRingOwner.java`);
  const fcm = read(`${ANDROID}/DibayFirebaseMessagingService.java`);
  const activity = read(`${ANDROID}/IncomingCallActivity.java`);
  const notification = read(`${ANDROID}/IncomingCallNotificationBuilder.java`);
  const mainActivity = read(`${ANDROID}/MainActivity.java`);
  const global = read("components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx");
  const doc = read("docs/community-messenger-native-call-receive.md");

  describe("session machine invariants", () => {
    it("activeCallId single-owner and duplicate FCM merge only", () => {
      expect(sessionMachine).toContain("activeCallId = sid");
      expect(sessionMachine).toContain("busy_rejected_new_call");
      expect(sessionMachine).toContain("duplicate_fcm_merge");
      expect(sessionMachine).toContain("stale_duplicate_ignored");
    });

    it("terminal phase blocks presenter re-show and missed during ACCEPTING", () => {
      expect(sessionMachine).toContain("blocksIncomingUiRepresent");
      expect(sessionMachine).toContain("blocksMissedTimeout");
      expect(sessionMachine).toContain("blocksStaleCleanup");
      expect(sessionMachine).toContain("incoming_ui_represent_blocked");
      expect(sessionMachine).toContain("missed_timeout_ignored");
    });

    it("forbidden cleanup reasons rejected at enum boundary", () => {
      expect(cleanupReason).toContain("isForbiddenWire");
      expect(cleanupReason).toContain('"activity_destroyed"');
      expect(cleanupReason).toContain('"notification_dismissed"');
      expect(cleanupReason).toContain('"unknown"');
      expect(ringOwner).toContain("ring_stop_forbidden use stopWithReason");
    });
  });

  describe("audio/video shared incoming lifecycle", () => {
    it("session machine owns both audio and video before accept", () => {
      expect(sessionMachine).toContain("mediaType");
      expect(sessionMachine).toContain("payload.callType");
      expect(coordinator).not.toMatch(/video[\s\S]{0,200}IncomingCallRingOwner/);
      expect(fcm).not.toMatch(/callType[\s\S]{0,120}stopWithReason/);
    });

    it("video media failure after accept uses media_failed_after_accept enum", () => {
      expect(cleanupReason).toContain('MEDIA_FAILED_AFTER_ACCEPT("media_failed_after_accept")');
      expect(terminal).toContain("MEDIA_FAILED_AFTER_ACCEPT");
    });
  });

  describe("foreground/background/lock/sleep matrix", () => {
    it("foreground: native pill on APK, Web banner on PWA", () => {
      expect(global).toContain("preferNativeAndroidForegroundIncoming: isCapacitorNativePlatform()");
      expect(fcm).toContain("incoming_call_foreground_native_pill");
      expect(mainActivity).toContain("IncomingCallForegroundUiLauncher.showUi");
      expect(fcm).not.toMatch(
        /foregroundUnlockedInteractive[\s\S]{0,400}showIncomingCall/
      );
    });

    it("document and route decision encode UI matrix", () => {
      expect(doc).toContain("UX policy (SSOT matrix)");
      expect(doc).toContain("**Foreground + unlocked**");
      expect(doc).toContain("**Lock / sleep + FSI allowed**");
      expect(read(`${ANDROID}/IncomingCallRouteDecision.java`)).toContain("FOREGROUND_BANNER");
      expect(read(`${ANDROID}/IncomingCallRouteDecision.java`)).toContain("INCOMING_ACTIVITY");
      expect(read(`${ANDROID}/IncomingCallRouteDecision.java`)).toContain("CALLSTYLE_FALLBACK");
      expect(fcm).toContain("IncomingCallRingingCoordinator.startRingingWithPresentation");
      expect(read(`${ANDROID}/IncomingCallBackgroundPresentation.java`)).toContain(
        "IncomingCallLockUiLauncher.launchIfNeeded"
      );
      expect(read(`${ANDROID}/IncomingCallLockUiLauncher.java`)).toContain(
        "incoming_activity_lock_direct_launch"
      );
    });

    it("lifecycle and notification dismiss do not end session", () => {
      const destroy = activity.match(/protected void onDestroy\(\) \{([\s\S]*?)\n  \}/)![1];
      expect(destroy).not.toContain("IncomingCallRingOwner");
      expect(destroy).not.toContain("IncomingCallTerminalHandler");
      expect(mainActivity).not.toMatch(
        /dismissIncomingCallNotificationFromIntent[\s\S]{0,250}RingOwner/
      );
      const dismiss = notification.match(
        /public static void dismissIncomingCall\([\s\S]*?^\  \}/m
      )![0];
      expect(dismiss).not.toContain("IncomingCallRingOwner");
    });
  });

  describe("ring tear-off prevention contract", () => {
    it("duplicate FCM merge does not restart ring", () => {
      const merge = fcm.slice(
        fcm.indexOf("if (receive.duplicateMerge)"),
        fcm.indexOf("DibayCallPushLog.logIncomingReceived")
      );
      expect(merge).not.toContain("startNativeRinging");
    });

    it("stale terminal does not cleanup active call", () => {
      expect(terminal).toContain("STALE_DUPLICATE_IGNORED");
      expect(sessionMachine).toContain("logStaleIgnored");
    });

    it("early ring_stop failure logged", () => {
      expect(read(`${ANDROID}/DibayForegroundRingtone.java`)).toContain("ring_stop_early_failure");
      expect(sessionMachine).toContain("ring_stop_early_failure");
    });
  });

  describe("server probe fail-closed policy", () => {
    it("probe failure defers cleanup with structured log", () => {
      expect(probe).toContain("server_probe_failed_deferred");
      expect(probe).toContain("ProbeResult");
      expect(coordinator).toContain("scheduleMissedProbeRetry");
      expect(sessionMachine).toContain("logProbeDeferred");
    });

    it("terminal handler confirms server before cancelled/missed/ended cleanup", () => {
      expect(terminal).toContain("confirmServerBeforeCleanup");
      expect(probe).toContain("requiresConfirmationBeforeCleanup");
      expect(probe).toContain("statusAllowsCleanup");
    });

    it("probe failure does not immediately cleanup active ringing call", () => {
      expect(probe).toContain("probeOffMainThread");
      const missed = coordinator.match(
        /handleMissedTimeout\([\s\S]*?scheduleMissedProbeRetry/
      );
      expect(missed).toBeTruthy();
      expect(coordinator).toMatch(
        /!probe\.ok[\s\S]{0,200}scheduleMissedProbeRetry/
      );
    });
  });

  describe("markCallConsumed / TerminalHandler / FGS alignment", () => {
    it("web plugin routes through TerminalHandler SSOT", () => {
      expect(plugin).toContain("IncomingCallTerminalHandler.handleWebConsumed");
      expect(plugin).toContain("IncomingCallTerminalHandler.stopIncomingPresentation");
      expect(plugin).not.toContain("IncomingCallRingOwner.stopWithReason");
      expect(terminal).toContain("applyNativeCleanup");
      expect(terminal).toContain("CallForegroundService.stopRinging");
    });

    it("web terminal inject does not unknown-cleanup native session", () => {
      expect(mainActivity).not.toMatch(
        /injectCallTerminalEvent[\s\S]{0,500}IncomingCallRingOwner/
      );
      expect(mainActivity).toContain("terminal_web_inject");
    });

    it("terminal cleanup reason enum is mandatory", () => {
      expect(terminal).toContain("terminal_cleanup_forbidden");
      expect(terminal).toContain("incoming_cleanup_forbidden reason=null");
      expect(terminal).toContain("web_consumed_forbidden");
    });
  });
});
