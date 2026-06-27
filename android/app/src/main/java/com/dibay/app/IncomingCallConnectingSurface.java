package com.dibay.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.dibay.app.callv4.CallV4Lane;

/** V4 warm accept — native connecting surface stays above MainActivity until Web call screen ready. */
public final class IncomingCallConnectingSurface {
  private static final String TAG = "DIBAY_CALL_V4";
  private static final int[] KEEP_ON_TOP_DELAYS_MS = {0, 80, 200, 450, 900};

  private IncomingCallConnectingSurface() {}

  /**
   * Finish native connecting surface only when MainActivity handoff gates pass (screen ready + alpha
   * restored + active instance present). Cold legacy path does not call this.
   */
  public static boolean handoffToWeb(Context context, String callId, String phase) {
    if (callId == null || callId.trim().isEmpty()) return false;
    if (context != null && DibayKeyguardHelper.isKeyguardLocked(context)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] native_connecting_surface_handoff_deferred callId="
              + callId.trim()
              + " reason=keyguard_locked");
      return false;
    }
    if (!IncomingCallActivity.isConnectingHandoffActive(callId)) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] native_connecting_surface_handoff_skipped callId="
              + callId.trim()
              + " reason=not_warm_connecting_handoff");
      return false;
    }
    String sid = callId.trim();
    MainActivity act = MainActivity.getActiveInstance();
    if (act == null) {
      Log.w(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] native_connecting_surface_handoff_blocked callId="
              + sid
              + " reason=no_main_activity activeInstance=absent");
      return false;
    }
    String blockReason = act.resolveConnectingHandoffBlockReason(sid);
    if (blockReason != null) {
      Log.i(
          CallV4Lane.TAG,
          "[DIBAY_CALL_V4] native_connecting_surface_handoff_deferred callId="
              + sid
              + " reason="
              + blockReason);
      return false;
    }
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_connecting_surface_handoff callId=" + sid + " phase=" + phase);
    IncomingCallActivity.finishConnectingSurfaceForCall(sid, "web_call_screen_ready");
    return true;
  }

  static void scheduleKeepOnTop(IncomingCallActivity activity) {
    if (activity == null || activity.isFinished() || !activity.isConnectingMode()) return;
    Handler handler = new Handler(Looper.getMainLooper());
    for (int delayMs : KEEP_ON_TOP_DELAYS_MS) {
      handler.postDelayed(() -> moveConnectingTaskToFront(activity), delayMs);
    }
  }

  private static void moveConnectingTaskToFront(IncomingCallActivity activity) {
    if (activity == null || activity.isFinished() || !activity.isConnectingMode()) return;
    try {
      ActivityManager am = activity.getSystemService(ActivityManager.class);
      if (am != null) {
        am.moveTaskToFront(activity.getTaskId(), ActivityManager.MOVE_TASK_NO_USER_ACTION);
      }
    } catch (Exception error) {
      Log.w(TAG, "[DIBAY_CALL_V4] connecting_surface_keep_on_top_failed err=" + error.getMessage());
    }
  }
}
