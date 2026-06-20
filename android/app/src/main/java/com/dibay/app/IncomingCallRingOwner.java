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

  private IncomingCallRingOwner() {}

  public static boolean start(Context context, String callId) {
    return start(context, callId, null);
  }

  public static boolean start(Context context, String callId, String callType) {
    if (context == null || callId == null || callId.trim().isEmpty()) return false;
    Context app = context.getApplicationContext();
    String sid = callId.trim();
    if (DibayCallConsumedStore.isConsumed(app, sid)) {
      Log.i(TAG, "[DIBAY_CALL] incoming_ignored_consumed callId=" + sid + " source=ring_owner");
      return false;
    }
    if (sid.equals(activeCallId)) {
      Log.i(TAG, "[DIBAY_CALL] ring_deduped callId=" + sid + " source=ring_owner");
      return false;
    }
    stop(app, null);
    DibayForegroundRingtone.start(app, sid, callType);
    activeCallId = sid;
    return true;
  }

  public static void stop(Context context, String callId) {
    if (context == null) return;
    String sid = callId != null ? callId.trim() : "";
    if (!sid.isEmpty()) {
      DibayForegroundRingtone.stop(sid);
      if (sid.equals(activeCallId)) {
        activeCallId = null;
      }
      return;
    }
    DibayForegroundRingtone.stop(activeCallId);
    activeCallId = null;
  }

  public static void stopAll(Context context) {
    stop(context, null);
  }

  public static String getActiveCallId() {
    return activeCallId;
  }
}
