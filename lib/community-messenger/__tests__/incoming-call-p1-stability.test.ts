import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(p: string): string {
  return readFileSync(join(process.cwd(), p), "utf8");
}

const ANDROID = "android/app/src/main/java/com/dibay/app";

describe("incoming-call P1 stability (native session machine)", () => {
  const sessionMachine = read(`${ANDROID}/IncomingCallSessionMachine.java`);
  const ringOwner = read(`${ANDROID}/IncomingCallRingOwner.java`);
  const cleanupReason = read(`${ANDROID}/IncomingCallCleanupReason.java`);
  const coordinator = read(`${ANDROID}/IncomingCallActionCoordinator.java`);
  const terminal = read(`${ANDROID}/IncomingCallTerminalHandler.java`);
  const fcm = read(`${ANDROID}/DibayFirebaseMessagingService.java`);
  const activity = read(`${ANDROID}/IncomingCallActivity.java`);
  const notification = read(`${ANDROID}/IncomingCallNotificationBuilder.java`);
  const ringtone = read(`${ANDROID}/DibayForegroundRingtone.java`);
  const plugin = read(`${ANDROID}/NativeIncomingCallPlugin.java`);
  const probe = read(`${ANDROID}/IncomingCallSessionStatusProbe.java`);
  const mainActivity = read(`${ANDROID}/MainActivity.java`);

  it("1. ring_start forbids unknown cleanup / reason-null ring_stop", () => {
    expect(ringOwner).toContain("stopWithReason");
    expect(ringOwner).toContain("ring_stop_forbidden reason=null");
    expect(ringtone).toContain("ring_start");
    expect(ringtone).toContain("ring_stop");
    expect(ringtone).toContain("ring_stop_early_failure");
    expect(cleanupReason).toContain("isForbiddenWire");
    expect(cleanupReason).toContain('"unknown"');
    expect(ringOwner).not.toMatch(/stopWithReason\([^)]*null[^)]*\)/);
  });

  it("2. duplicate FCM merge does not restart ring", () => {
    expect(fcm).toContain("duplicateMerge");
    expect(fcm).toContain("refreshIncomingCallIfPresent");
    const mergeBlock = fcm.slice(
      fcm.indexOf("if (receive.duplicateMerge)"),
      fcm.indexOf("DibayCallPushLog.logIncomingReceived")
    );
    expect(mergeBlock).not.toContain("startNativeRinging");
    expect(mergeBlock).not.toContain("IncomingCallRingOwner.start");
  });

  it("3. duplicate FCM does not stop active call", () => {
    expect(sessionMachine).toContain("duplicate_fcm_merge");
    expect(sessionMachine).toContain("blocksStaleCleanup");
    const mergeReturn = sessionMachine.match(
      /if \(!active\.isEmpty\(\) && active\.equals\(sid\)\)[\s\S]*?return new ReceiveDecision\(true, true/
    );
    expect(mergeReturn).toBeTruthy();
    expect(fcm).not.toMatch(
      /duplicateMerge[\s\S]{0,400}IncomingCallTerminalHandler\.handle/
    );
  });

  it("4. Activity onDestroy alone does not cleanup active ringing call", () => {
    const destroyBlock = activity.match(/protected void onDestroy\(\) \{([\s\S]*?)\n  \}/);
    expect(destroyBlock).toBeTruthy();
    const body = destroyBlock![1];
    expect(body).not.toContain("IncomingCallRingOwner");
    expect(body).not.toContain("incoming_cleanup");
    expect(body).not.toContain("IncomingCallTerminalHandler");
    expect(body).not.toContain("CallForegroundService.stopRinging");
  });

  it("5. notification dismissed alone does not cleanup active ringing call", () => {
    expect(notification).toMatch(/dismissIncomingCall\([\s\S]*?cancel\(/);
    const dismiss = notification.match(
      /public static void dismissIncomingCall\([\s\S]*?^\  \}/m
    );
    expect(dismiss).toBeTruthy();
    expect(dismiss![0]).not.toContain("IncomingCallRingOwner");
    expect(dismiss![0]).not.toContain("IncomingCallTerminalHandler");
    expect(mainActivity).toMatch(
      /dismissIncomingCallNotificationFromIntent[\s\S]*?dismissIncomingCall/
    );
    expect(mainActivity).not.toMatch(
      /dismissIncomingCallNotificationFromIntent[\s\S]{0,200}IncomingCallRingOwner/
    );
  });

  it("6. ACCEPTING state ignores missed_timeout cleanup", () => {
    expect(sessionMachine).toContain("blocksMissedTimeout");
    expect(coordinator).toContain("canApplyMissedTimeout");
    expect(coordinator).toContain("missed_timeout_ignored_phase");
    expect(sessionMachine).toContain("missed_timeout_ignored");
  });

  it("7. ACCEPTED state blocks incoming UI re-present", () => {
    expect(sessionMachine).toContain("blocksIncomingUiRepresent");
    expect(sessionMachine).toContain("incoming_ui_represent_blocked");
    expect(notification).toContain("canRepresentIncomingUi");
    expect(notification).toContain("incoming_ui_blocked_phase");
  });

  it("8. caller_cancelled only cleans matching callId with server verify", () => {
    expect(sessionMachine).toContain("onCallerCancelled");
    expect(sessionMachine).toContain("caller_cancel_blocked_server_status");
    expect(sessionMachine).toContain("logProbeDeferred");
    expect(probe).toContain("server_probe_failed_deferred");
    expect(terminal).toContain("confirmServerBeforeCleanup");
    expect(terminal).toContain("STALE_DUPLICATE_IGNORED");
  });

  it("9. stale callId does not cancel latest active call", () => {
    expect(sessionMachine).toContain("stale_duplicate_ignored");
    expect(sessionMachine).toContain("logStaleIgnored");
    expect(terminal).toMatch(
      /!sid\.equals\(IncomingCallSessionMachine\.getActiveCallId\(\)\)[\s\S]*STALE_DUPLICATE_IGNORED/
    );
    expect(ringOwner).toContain("shouldStopRing");
  });

  it("10. audio/video incoming lifecycle shares same state machine", () => {
    expect(sessionMachine).toContain("mediaType");
    expect(sessionMachine).toContain("payload.callType");
    const phase = read(`${ANDROID}/IncomingCallSessionPhase.java`);
    expect(phase).toContain("audio/video share the same lifecycle");
    expect(fcm).not.toMatch(/callType[\s\S]{0,80}IncomingCallRingOwner\.stop/);
    expect(coordinator).not.toMatch(/video[\s\S]{0,120}permission[\s\S]{0,80}stop/);
  });

  it("session phases and cleanup reason enum are SSOT", () => {
    expect(sessionMachine).toContain("call_session_state_transition");
    expect(cleanupReason).toContain('ACCEPTED("accepted")');
    expect(cleanupReason).toContain('CALLER_CANCELLED("caller_cancelled")');
    expect(cleanupReason).toContain('MISSED_TIMEOUT("missed_timeout")');
    expect(cleanupReason).toContain('STALE_DUPLICATE_IGNORED("stale_duplicate_ignored")');
    expect(cleanupReason).toContain('MEDIA_FAILED_AFTER_ACCEPT("media_failed_after_accept")');
    expect(coordinator).toContain("IncomingCallSessionMachine.logIncomingCleanup");
    expect(terminal).toContain("IncomingCallSessionMachine.logIncomingCleanup");
    expect(plugin).toContain("IncomingCallCleanupReason.fromWire");
    expect(mainActivity).not.toMatch(
      /injectCallTerminalEvent[\s\S]{0,600}IncomingCallRingOwner\.stop/
    );
  });

  it("logcat tags and structured events exist for device QA", () => {
    const routeDecision = read(`${ANDROID}/IncomingCallRouteDecision.java`);
    const fcmService = read(`${ANDROID}/DibayFirebaseMessagingService.java`);
    const pushLog = read(`${ANDROID}/DibayCallPushLog.java`);
    expect(sessionMachine).toContain("[DIBAY_CALL] call_session_state_transition");
    expect(routeDecision).toContain("incoming_route_decision");
    expect(notification).toContain("ring_owner_decision");
    expect(ringtone).toContain("[DIBAY_CALL] ring_start");
    expect(ringtone).toContain("[DIBAY_CALL] ring_stop");
    expect(notification).toContain("incoming_ui_surface");
    expect(coordinator).toContain("incoming_action_guard");
    expect(sessionMachine).toContain("incoming_cleanup");
    expect(fcmService).toContain("DIBAY_FCM");
    expect(pushLog).toContain("DIBAY_CALL_PUSH");
  });
});
