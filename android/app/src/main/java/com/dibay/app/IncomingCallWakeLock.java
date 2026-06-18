package com.dibay.app;

import android.content.Context;
import android.os.PowerManager;
import android.util.Log;

/** Lock / background incoming — keep CPU awake so ring + UI delivery are not deferred. */
public final class IncomingCallWakeLock {
  private static final String TAG = "DIBAY_CALL";
  private static PowerManager.WakeLock wakeLock;

  private IncomingCallWakeLock() {}

  public static void acquire(Context context, String callId) {
    acquireInternal(context, callId, 60_000L, "background");
  }

  /** Lock / screen-off — longer hold + wakeup so cold FGS + Activity are not deferred. */
  public static void acquireForLockScreen(Context context, String callId) {
    acquireInternal(context, callId, 90_000L, "lock");
  }

  private static void acquireInternal(Context context, String callId, long timeoutMs, String source) {
    if (context == null) return;
    release();
    try {
      PowerManager pm = (PowerManager) context.getApplicationContext().getSystemService(Context.POWER_SERVICE);
      if (pm == null) return;
      wakeLock =
          pm.newWakeLock(
              PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
              "dibay:incoming:" + (callId != null ? callId : "call"));
      wakeLock.setReferenceCounted(false);
      wakeLock.acquire(timeoutMs);
      Log.i(TAG, "[DIBAY_CALL] incoming_wake_lock_acquired callId=" + callId + " source=" + source);
    } catch (Exception error) {
      Log.w(TAG, "[DIBAY_CALL] incoming_wake_lock_failed err=" + error.getMessage());
    }
  }

  public static void release() {
    if (wakeLock == null) return;
    try {
      if (wakeLock.isHeld()) wakeLock.release();
    } catch (Exception ignored) {
    }
    wakeLock = null;
  }
}
