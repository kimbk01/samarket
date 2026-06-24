package com.dibay.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.dibay.app.callv4.CallV4Lane;

/** V4 accept — native connecting surface stays above MainActivity until Web call screen ready. */
public final class IncomingCallConnectingSurface {
  private static final String TAG = "DIBAY_CALL_V4";
  private static final int[] KEEP_ON_TOP_DELAYS_MS = {0, 80, 200, 450, 900};

  private IncomingCallConnectingSurface() {}

  public static void handoffToWeb(Context context, String callId, String phase) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    Log.i(
        CallV4Lane.TAG,
        "[DIBAY_CALL_V4] native_connecting_surface_handoff callId=" + sid + " phase=" + phase);
    IncomingCallActivity.finishConnectingSurfaceForCall(sid, "web_call_screen_ready");
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
