package com.dibay.app;

import android.content.Context;
import android.util.Log;

/**
 * Single owner for foreground incoming OS ringtone.
 * All native start/stop must go through here — consumed tombstone checked before start.
 */
public final class IncomingCallRingOwner {
  private static final String TAG = "DIBAY_CALL";
  private static volatile String activeCallId = null;
  private static volatile long ringStartedAtMs = 0L;

  private IncomingCallRingOwner() {}

  public static boolean start(Context context, String callId, String source) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    if (DibayCallConsumedStore.isConsumed(app, sid)) {
      Log.i(TAG, "[DIBAY_CALL] incoming_ignored_consumed callId=" + sid + " source=ring_owner");
      IncomingCallNotificationBuilder.logRingOwnerDecision(sid, false, "consumed");
      return false;
    }
    if (sid.equals(activeCallId)) {
      Log.i(TAG, "[DIBAY_CALL] ring_deduped callId=" + sid + " source=ring_owner");
      IncomingCallNotificationBuilder.logRingOwnerDecision(sid, false, "deduped");
      return false;
    }
    if (activeCallId != null && !activeCallId.isEmpty()) {
      stopWithReason(app, activeCallId, IncomingCallCleanupReason.STALE_DUPLICATE_IGNORED, "ring_replace", "ring_owner");
    }
    long now = System.currentTimeMillis();
    DibayForegroundRingtone.start(app, sid, source, now);
    activeCallId = sid;
    ringStartedAtMs = now;
    IncomingCallSessionMachine.onRinging(sid, source != null ? source : "ring_owner");
    IncomingCallNotificationBuilder.logRingOwnerDecision(sid, true, "ring_owner_start");
    return true;
  }

  /** @deprecated use {@link #start(Context, String, String)} */
  public static boolean start(Context context, String callId) {
    return start(context, callId, "ring_owner");
  }

  public static void stopWithReason(
      Context context, String callId, IncomingCallCleanupReason reason, String source, String stopCaller) {
    if (context == null || reason == null) {
      Log.e(TAG, "[DIBAY_CALL] ring_stop_forbidden reason=null callId=" + callId);
      return;
    }
    String sid = callId != null ? callId.trim() : "";
    if (sid.isEmpty()) {
      sid = activeCallId != null ? activeCallId : "";
    }
    if (sid.isEmpty()) return;

    if (!IncomingCallSessionMachine.shouldStopRing(sid, reason)) {
      return;
    }

    long elapsed = ringStartedAtMs > 0L ? System.currentTimeMillis() - ringStartedAtMs : -1L;
    DibayForegroundRingtone.stop(sid, reason.wire, elapsed, stopCaller != null ? stopCaller : source);
    if (sid.equals(activeCallId)) {
      activeCallId = null;
      ringStartedAtMs = 0L;
    }
  }

  /** @deprecated use {@link #stopWithReason} — reason-less stop is forbidden for active sessions. */
  public static void stop(Context context, String callId) {
    Log.e(
        TAG,
        "[DIBAY_CALL] ring_stop_forbidden use stopWithReason callId="
            + callId
            + " stopCaller=legacy_stop");
  }

  public static void stopAll(Context context) {
    if (activeCallId == null) return;
    stopWithReason(context, activeCallId, IncomingCallCleanupReason.APP_SHUTDOWN_SAFE_CLEAR, "stop_all", "ring_owner");
  }

  public static String getActiveCallId() {
    return activeCallId;
  }

  public static long getRingStartedAtMs() {
    return ringStartedAtMs;
  }
}
