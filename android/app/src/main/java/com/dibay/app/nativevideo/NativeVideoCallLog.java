package com.dibay.app.nativevideo;

import android.util.Log;

/** Native video runtime logs. Do not reuse DIBAY_CALL_V4 markers in this package. */
public final class NativeVideoCallLog {
  public static final String TAG = "DIBAY_NATIVE_VIDEO";
  private static final String PREFIX = "[DIBAY_NATIVE_VIDEO] ";

  private NativeVideoCallLog() {}

  public static void info(String marker, String callId) {
    info(marker, callId, "");
  }

  public static void info(String marker, String callId, String details) {
    Log.i(TAG, format(marker, callId, details));
    String alias = qaAlias(marker);
    if (alias != null) {
      Log.i(TAG, format(alias, callId, details));
    }
  }

  public static void warn(String marker, String callId, String details) {
    Log.w(TAG, format(marker, callId, details));
  }

  /** CUT1/CUT2/CUT4 evidence correlation — no tokens; grep DIBAY_CALL_CORR. */
  public static void corr(String marker, String callId, String details) {
    String extra =
        "marker="
            + (marker != null ? marker.trim() : "unknown")
            + " wall_ms="
            + System.currentTimeMillis()
            + (details != null && !details.trim().isEmpty() ? " " + details.trim() : "");
    Log.i(TAG, format("DIBAY_CALL_CORR", callId, extra));
  }

  private static String format(String marker, String callId, String details) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : "unknown";
    String extra = details != null && !details.trim().isEmpty() ? " " + details.trim() : "";
    return PREFIX + marker + " callId=" + sid + extra;
  }

  private static String qaAlias(String marker) {
    if ("agora_native_join_start".equals(marker)) return "agora_native_video_join_start";
    if ("agora_native_join_success".equals(marker)) return "agora_native_video_join_success";
    if ("local_camera_preview_started".equals(marker)) return "local_camera_publish_success";
    if ("remote_video_render_ready".equals(marker)) return "remote_video_rendered";
    if ("caller_agora_native_join_start".equals(marker)) return "caller_native_video_join_start";
    if ("caller_local_camera_preview_started".equals(marker)) return "caller_local_camera_publish_success";
    return null;
  }
}
