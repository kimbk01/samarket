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
  }

  public static void warn(String marker, String callId, String details) {
    Log.w(TAG, format(marker, callId, details));
  }

  private static String format(String marker, String callId, String details) {
    String sid = callId != null && !callId.trim().isEmpty() ? callId.trim() : "unknown";
    String extra = details != null && !details.trim().isEmpty() ? " " + details.trim() : "";
    return PREFIX + marker + " callId=" + sid + extra;
  }
}
