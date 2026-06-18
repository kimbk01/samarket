package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;

/**
 * Single entry for remote/local call terminal — cancel, reject, missed, ended.
 * Runs regardless of app foreground state.
 */
public final class IncomingCallTerminalHandler {
  private static final String TAG = "DIBAY_CALL";

  private IncomingCallTerminalHandler() {}

  public static void handle(Context context, String callId, String terminalKind, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    String kind = terminalKind != null ? terminalKind.trim().toLowerCase() : "cancelled";
    String consumedReason = mapConsumedReason(kind);

    Log.i(TAG, "[DIBAY_CALL] terminal_received callId=" + sid + " kind=" + kind + " source=" + source);

    IncomingCallNotificationBuilder.dismissIncomingCall(app, sid);
    DibayCallConsumedStore.mark(app, sid, consumedReason);
    Log.i(TAG, "[DIBAY_CALL] terminal_tombstone_mark callId=" + sid + " reason=" + consumedReason);
    IncomingCallRingOwner.stop(app, sid);
    Log.i(TAG, "[DIBAY_CALL] ring_stop callId=" + sid + " source=terminal_handler");
    DibayCallPushLog.info("ringtone_stop_native", sid, "reason=" + consumedReason + " source=terminal_handler");
    CallForegroundService.stopRinging(app, sid, consumedReason);
    DibayIncomingCallNativeStore.clear(app, sid, consumedReason);

    IncomingCallActionCoordinator.complete(sid, kind);

    MainActivity.clearPersistedPendingPushRoute(app);
    MainActivity.clearPersistedCallPendingRoute(app);
    DibayCallPushLog.info("pending_route_discarded_terminal", sid, "kind=" + kind);
    MainActivity.clearNativeCalleeAcceptPending(app);

    broadcastFinishIncomingActivity(app, sid);
    ForegroundIncomingCallRegistry.clear(sid);

    String webStatus = mapWebTerminalStatus(kind);
    if ("cancelled".equals(kind) || "canceled".equals(kind)) {
      Log.i(TAG, "[DIBAY_CALL] call_canceled_native_handled callId=" + sid + " source=" + source);
    }
    MainActivity.deliverCallTerminalEvent(app, sid, webStatus);

    Log.i(TAG, "[DIBAY_CALL] terminal_handler_done callId=" + sid + " kind=" + kind);
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

  /** Dismiss lock-screen and in-app foreground incoming UI for callId. */
  public static void finishIncomingUiOnly(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    broadcastFinishIncomingActivity(context, callId.trim());
    ForegroundIncomingCallRegistry.clear(callId.trim());
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
