package com.dibay.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import com.dibay.app.call.CallForegroundService;
import com.dibay.app.nativecall.NativeCallRuntimeEndDispatcher;

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
    // Before cleanup: is a DIFFERENT call ringing / shown now (e.g. caller cancelled A and redialed B)?
    boolean otherCallActive = isOtherIncomingCallActive(app, sid);
    NativeCallRuntimeEndDispatcher.dispatch(app, sid, kind, "terminal_handler:" + source);

    IncomingCallSessionCleanup.purgeCallPresentation(app, sid, consumedReason);
    DibayCallConsumedStore.mark(app, sid, consumedReason);
    Log.i(TAG, "[DIBAY_CALL] terminal_tombstone_mark callId=" + sid + " reason=" + consumedReason);

    IncomingCallActionCoordinator.complete(sid, kind);

    if (!otherCallActive) {
      MainActivity.clearPersistedPendingPushRoute(app);
      MainActivity.clearPersistedCallPendingRoute(app);
      DibayCallPushLog.info("pending_route_discarded_terminal", sid, "kind=" + kind);
      MainActivity.clearNativeCalleeAcceptPending(app);
    } else {
      // Pending push route / accept-pending are not callId-keyed: keep them for the active call.
      // The call pending route IS callId-keyed: drop it only when it belongs to this (terminated) call.
      if (sid.equals(MainActivity.readPersistedCallPendingCallId(app))) {
        MainActivity.clearPersistedCallPendingRoute(app);
      }
      DibayCallPushLog.info("pending_route_kept_other_call_active", sid, "kind=" + kind);
    }

    ForegroundIncomingCallRegistry.clear(sid);

    String webStatus = mapWebTerminalStatus(kind);
    if ("cancelled".equals(kind) || "canceled".equals(kind)) {
      Log.i(TAG, "[DIBAY_CALL] call_canceled_native_handled callId=" + sid + " source=" + source);
    }
    MainActivity.deliverCallTerminalEvent(app, sid, webStatus);

    Log.i(TAG, "[DIBAY_CALL] terminal_handler_done callId=" + sid + " kind=" + kind);
  }

  /**
   * True when a call OTHER than {@code callId} is ringing (RingOwner), shown as the in-app pill
   * (ForegroundIncomingCallRegistry) or still live in the native incoming store
   * (ringing / connecting / active — covers the accept handoff). A late terminal for a previous call
   * must then touch only its own state, never the current call's ring, screen or pending accept.
   */
  public static boolean isOtherIncomingCallActive(Context context, String callId) {
    String sid = callId != null ? callId.trim() : "";
    if (sid.isEmpty()) return false;
    if (isOtherCallId(sid, IncomingCallRingOwner.getActiveCallId())) return true;
    if (isOtherCallId(sid, ForegroundIncomingCallRegistry.getActiveCallId())) return true;
    String stored = DibayIncomingCallNativeStore.getActiveCallId(context);
    if (!isOtherCallId(sid, stored)) return false;
    String state = DibayIncomingCallNativeStore.getState(context, stored);
    if (DibayIncomingCallNativeStore.STATE_RINGING.equals(state)) {
      // A stale (expired) ringing record must not keep suppressing global cleanup forever.
      long expiresAt = DibayIncomingCallNativeStore.getExpiresAtMs(context, stored);
      return expiresAt <= 0L || System.currentTimeMillis() < expiresAt;
    }
    return DibayIncomingCallNativeStore.STATE_CONNECTING.equals(state)
        || DibayIncomingCallNativeStore.STATE_ACTIVE.equals(state);
  }

  private static boolean isOtherCallId(String sid, String candidate) {
    return candidate != null && !candidate.trim().isEmpty() && !sid.equals(candidate.trim());
  }

  public static boolean isTerminalPushType(String type) {
    if (type == null) return false;
    switch (type.trim().toLowerCase()) {
      case "call_canceled":
      case "call_cancelled":
      case "call_ended":
      case "call_rejected":
      case "call_answered_elsewhere":
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
      case "call_answered_elsewhere":
        return "answered_elsewhere";
      case "call_missed":
      case "missed_call":
        return "missed";
      case "call_ended":
        return "ended";
      default:
        return "cancelled";
    }
  }

  /** Dismiss lock-screen and in-app foreground incoming UI for callId. */
  public static void finishIncomingUiOnly(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    IncomingCallSessionCleanup.purgeCallPresentation(context, callId.trim(), "finish_ui_only");
  }

  static void broadcastFinishIncomingActivity(Context context, String callId) {
    if (context == null || callId == null || callId.trim().isEmpty()) return;
    Intent intent = new Intent(IncomingCallActivity.ACTION_TERMINAL);
    intent.setPackage(context.getPackageName());
    intent.putExtra(IncomingCallActivity.EXTRA_CALL_ID, callId.trim());
    context.sendBroadcast(intent);
  }

  private static String mapConsumedReason(String kind) {
    switch (kind) {
      case "rejected":
        return "declined";
      case "missed":
        return "missed";
      case "ended":
        return "ended";
      case "answered_elsewhere":
        return "answered_elsewhere";
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
      case "answered_elsewhere":
        return "answered_elsewhere";
      default:
        return "cancelled";
    }
  }
}
