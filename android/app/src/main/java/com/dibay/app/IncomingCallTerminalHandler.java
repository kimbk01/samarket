package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;

/**
 * Single entry for remote/local call terminal — cancel, reject, missed, ended.
 * Web {@code markCallConsumed} and native FCM terminal must route through here (or
 * {@link #handleWebConsumed}) so ring, notification, FGS, activity, and session stay aligned.
 */
public final class IncomingCallTerminalHandler {
  private static final String TAG = "DIBAY_CALL";

  private IncomingCallTerminalHandler() {}

  public static void handle(Context context, String callId, String terminalKind, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String kind = terminalKind != null ? terminalKind.trim().toLowerCase() : "cancelled";

    if (!sid.equals(IncomingCallSessionMachine.getActiveCallId())
        && IncomingCallSessionMachine.getPhase(sid) == null) {
      IncomingCallSessionMachine.logIncomingCleanup(
          sid, IncomingCallCleanupReason.STALE_DUPLICATE_IGNORED, source, false, false, false, false);
      return;
    }

    IncomingCallCleanupReason cleanupReason = mapCleanupReason(kind);
    if (cleanupReason == null) {
      Log.e(TAG, "[DIBAY_CALL] terminal_cleanup_forbidden kind=" + kind + " callId=" + sid);
      return;
    }

    if (!confirmServerBeforeCleanup(app, sid, cleanupReason, source)) {
      return;
    }

    Log.i(TAG, "[DIBAY_CALL] terminal_received callId=" + sid + " kind=" + kind + " source=" + source);

    if (!applySessionTerminalPhase(app, sid, cleanupReason, source)) {
      return;
    }

    String consumedReason = mapConsumedReason(kind);
    applyNativeCleanup(
        app,
        sid,
        cleanupReason,
        source,
        "terminal_handler",
        consumedReason,
        true,
        true,
        true);

    if ("cancelled".equals(kind) || "canceled".equals(kind)) {
      Log.i(TAG, "[DIBAY_CALL] call_canceled_native_handled callId=" + sid + " source=" + source);
    }
    MainActivity.deliverCallTerminalEvent(app, sid, mapWebTerminalStatus(kind));

    Log.i(TAG, "[DIBAY_CALL] terminal_handler_done callId=" + sid + " kind=" + kind);
  }

  /** Web plugin {@code markCallConsumed} — SSOT cleanup (ring + notification + FGS + session). */
  public static void handleWebConsumed(Context context, String callId, String reasonWire, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    IncomingCallCleanupReason reason = IncomingCallCleanupReason.fromWire(reasonWire);
    if (reason == null) {
      Log.e(TAG, "[DIBAY_CALL] web_consumed_forbidden reason=null callId=" + sid);
      return;
    }
    Context app = context.getApplicationContext();
    switch (reason) {
      case ACCEPTED:
        handleWebAccepted(app, sid, source);
        break;
      case MEDIA_FAILED_AFTER_ACCEPT:
        applyNativeCleanup(
            app,
            sid,
            reason,
            source,
            "web_plugin",
            "accepted",
            true,
            false,
            false);
        IncomingCallSessionMachine.logIncomingCleanup(
            sid, reason, source, true, true, true, false);
        break;
      case REJECTED:
      case CALLER_CANCELLED:
      case MISSED_TIMEOUT:
      case REMOTE_ENDED:
        handle(app, sid, terminalKindFromReason(reason), source + ":markCallConsumed");
        break;
      default:
        Log.e(
            TAG,
            "[DIBAY_CALL] web_consumed_forbidden reason=" + reason.wire + " callId=" + sid);
    }
  }

  /** Web plugin {@code stopIncomingRingtone} — ring + FGS only; does not end session. */
  public static void stopIncomingPresentation(
      Context context, String callId, IncomingCallCleanupReason reason, String source) {
    if (context == null || reason == null) {
      Log.e(TAG, "[DIBAY_CALL] ring_stop_forbidden reason=null callId=" + callId);
      return;
    }
    String sid = callId != null ? callId.trim() : "";
    if (sid.isEmpty()) {
      sid = IncomingCallRingOwner.getActiveCallId();
    }
    if (sid == null || sid.isEmpty()) return;
    Context app = context.getApplicationContext();
    IncomingCallRingOwner.stopWithReason(app, sid, reason, source, "terminal_handler.stopPresentation");
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=" + reason.wire + " source=" + source);
    CallForegroundService.stopRinging(app, sid, reason.wire);
  }

  private static void handleWebAccepted(Context app, String sid, String source) {
    IncomingCallSessionMachine.tryBeginAccepting(sid, source);
    DibayCallConsumedStore.mark(app, sid, "accepted");
    applyNativeCleanup(
        app, sid, IncomingCallCleanupReason.ACCEPTED, source, "web_plugin", "accepted", true, false, false);
    IncomingCallSessionMachine.onAccepted(sid, source);
    IncomingCallSessionMachine.logIncomingCleanup(
        sid, IncomingCallCleanupReason.ACCEPTED, source, true, true, true, false);
  }

  private static boolean confirmServerBeforeCleanup(
      Context app, String sid, IncomingCallCleanupReason cleanupReason, String source) {
    if (!IncomingCallSessionStatusProbe.requiresConfirmationBeforeCleanup(cleanupReason)) {
      return true;
    }
    IncomingCallSessionStatusProbe.ProbeResult probe = IncomingCallSessionStatusProbe.probe(app, sid);
    if (!probe.ok) {
      IncomingCallSessionStatusProbe.logProbeDeferred(sid, source, probe.failureDetail);
      return false;
    }
    if (IncomingCallSessionStatusProbe.isActiveStatus(probe.status)) {
      Log.w(
          TAG,
          "[DIBAY_CALL] terminal_blocked_active_server_status callId="
              + sid
              + " status="
              + probe.status
              + " reason="
              + cleanupReason.wire
              + " source="
              + source);
      return false;
    }
    if (!IncomingCallSessionStatusProbe.statusAllowsCleanup(cleanupReason, probe.status)) {
      Log.w(
          TAG,
          "[DIBAY_CALL] terminal_blocked_server_status callId="
              + sid
              + " status="
              + probe.status
              + " reason="
              + cleanupReason.wire
              + " source="
              + source);
      return false;
    }
    return true;
  }

  private static boolean applySessionTerminalPhase(
      Context app, String sid, IncomingCallCleanupReason cleanupReason, String source) {
    switch (cleanupReason) {
      case CALLER_CANCELLED:
        return IncomingCallSessionMachine.onCallerCancelled(app, sid, source, true);
      case REMOTE_ENDED:
        IncomingCallSessionMachine.onRemoteEnded(sid, source);
        return true;
      case REJECTED:
        IncomingCallSessionMachine.onRejected(sid, source);
        return true;
      case MISSED_TIMEOUT:
        if (!IncomingCallSessionMachine.canApplyMissedTimeout(sid)) {
          return false;
        }
        IncomingCallSessionMachine.onMissed(sid, source);
        return true;
      default:
        return true;
    }
  }

  /** Ring, notification, FGS, activity finish — shared native cleanup SSOT. */
  static void applyNativeCleanup(
      Context app,
      String sid,
      IncomingCallCleanupReason cleanupReason,
      String source,
      String stopCaller,
      String consumedReason,
      boolean dismissNotification,
      boolean finishActivity,
      boolean deliverCoordinatorComplete) {
    if (cleanupReason == null) {
      Log.e(TAG, "[DIBAY_CALL] incoming_cleanup_forbidden reason=null callId=" + sid);
      return;
    }
    if (dismissNotification) {
      IncomingCallNotificationBuilder.dismissIncomingCall(app, sid);
    }
    if (consumedReason != null && !consumedReason.isEmpty()) {
      DibayCallConsumedStore.mark(app, sid, consumedReason);
      Log.i(TAG, "[DIBAY_CALL] terminal_tombstone_mark callId=" + sid + " reason=" + consumedReason);
    }
    IncomingCallRingOwner.stopWithReason(app, sid, cleanupReason, source, stopCaller);
    IncomingCallWakeLock.release();
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=" + cleanupReason.wire + " source=" + stopCaller);
    CallForegroundService.stopRinging(app, sid, cleanupReason.wire);
    DibayIncomingCallNativeStore.clear(app, sid, cleanupReason.wire);

    if (deliverCoordinatorComplete) {
      IncomingCallActionCoordinator.complete(sid, cleanupReason.wire);
      MainActivity.clearPersistedPendingPushRoute(app);
      MainActivity.clearPersistedCallPendingRoute(app);
      DibayCallPushLog.info("pending_route_discarded_terminal", sid, "kind=" + cleanupReason.wire);
      MainActivity.clearNativeCalleeAcceptPending(app);
    }

    if (finishActivity) {
      broadcastFinishIncomingActivity(app, sid);
      ForegroundIncomingCallRegistry.clear(sid);
    }

    IncomingCallSessionMachine.logIncomingCleanup(
        sid,
        cleanupReason,
        source,
        true,
        true,
        dismissNotification,
        finishActivity);
  }

  public static boolean isTerminalPushType(String type) {
    if (type == null) return false;
    switch (type.trim().toLowerCase()) {
      case "call_canceled":
      case "call_cancelled":
      case "call_ended":
      case "call_rejected":
      case "call_missed":
      case "missed_call":
        return true;
      default:
        return false;
    }
  }

  public static String normalizeTerminalKind(String type) {
    if (type == null) return "cancelled";
    switch (type.trim().toLowerCase()) {
      case "call_canceled":
      case "call_cancelled":
        return "cancelled";
      case "call_rejected":
        return "rejected";
      case "call_missed":
      case "missed_call":
        return "missed";
      case "call_ended":
        return "ended";
      default:
        return "cancelled";
    }
  }

  private static void broadcastFinishIncomingActivity(Context context, String callId) {
    Intent intent = new Intent(IncomingCallActivity.ACTION_TERMINAL);
    intent.setPackage(context.getPackageName());
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId);
    context.sendBroadcast(intent);
  }

  /** Dismiss lock-screen UI only — does not end call session or stop ring. */
  public static void finishIncomingUiOnly(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    broadcastFinishIncomingActivity(context, callId.trim());
    ForegroundIncomingCallRegistry.clear(callId.trim());
  }

  private static String terminalKindFromReason(IncomingCallCleanupReason reason) {
    switch (reason) {
      case REJECTED:
        return "rejected";
      case MISSED_TIMEOUT:
        return "missed";
      case REMOTE_ENDED:
        return "ended";
      case CALLER_CANCELLED:
      default:
        return "cancelled";
    }
  }

  private static IncomingCallCleanupReason mapCleanupReason(String kind) {
    switch (kind) {
      case "rejected":
        return IncomingCallCleanupReason.REJECTED;
      case "missed":
        return IncomingCallCleanupReason.MISSED_TIMEOUT;
      case "ended":
        return IncomingCallCleanupReason.REMOTE_ENDED;
      case "cancelled":
      case "canceled":
        return IncomingCallCleanupReason.CALLER_CANCELLED;
      default:
        return null;
    }
  }

  private static String mapConsumedReason(String kind) {
    switch (kind) {
      case "rejected":
        return "declined";
      case "missed":
        return "missed";
      case "ended":
        return "ended";
      case "cancelled":
      case "canceled":
      default:
        return "cancelled";
    }
  }

  private static String mapWebTerminalStatus(String kind) {
    switch (kind) {
      case "rejected":
        return "rejected";
      case "missed":
        return "missed";
      case "ended":
        return "ended";
      default:
        return "cancelled";
    }
  }
}
