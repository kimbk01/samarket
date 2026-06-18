package com.dibay.app;

import android.content.Context;
import android.os.PowerManager;
import android.util.Log;

/** Keeps CPU awake during lock/background incoming ring + UI delivery. */
public final class IncomingCallWakeLock {
  private static final String TAG = "DIBAY_INCOMING_CALL";
  private static final String LOCK_TAG = "dibay:incoming_call";
  private static PowerManager.WakeLock active;

  private IncomingCallWakeLock() {}

  public static void acquire(Context context, String callId) {
    if (context == null) return;
    release();
    try {
      PowerManager pm = context.getApplicationContext().getSystemService(PowerManager.class);
      if (pm == null) return;
      PowerManager.WakeLock lock =
          pm.newWakeLock(
              PowerManager.PARTIAL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
              LOCK_TAG + ":" + (callId != null ? callId.trim() : "unknown"));
      lock.setReferenceCounted(false);
      lock.acquire(60_000L);
      active = lock;
      Log.i(TAG, "[call-ui] incoming_wake_lock_acquired callId=" + callId);
    } catch (Exception error) {
      Log.w(TAG, "[call-ui] incoming_wake_lock_failed callId=" + callId + " err=" + error.getMessage());
    }
  }

  public static void release() {
    if (active == null) return;
    try {
      if (active.isHeld()) {
        active.release();
      }
    } catch (Exception ignored) {
    }
    active = null;
  }
}
