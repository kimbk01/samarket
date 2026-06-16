package com.dibay.app;

import android.util.Log;
import java.util.concurrent.ConcurrentHashMap;

/** Single-prefix call flow logger. Each step is emitted once per callId. */
public final class DibayCallLog {
  private static final String TAG = "DIBAY_CALL";
  private static final ConcurrentHashMap<String, Boolean> EMITTED = new ConcurrentHashMap<>();

  private DibayCallLog() {}

  public static void once(String step, String callId) {
    once(step, callId, null);
  }

  public static void once(String step, String callId, String extra) {
    if (step == null || step.trim().isEmpty()) return;
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    String normalizedStep = step.trim();
    String key = sid + ":" + normalizedStep;
    if (EMITTED.putIfAbsent(key, true) != null) return;
    String suffix = extra != null && !extra.trim().isEmpty() ? " " + extra.trim() : "";
    Log.i(TAG, "[DIBAY_CALL] " + normalizedStep + " callId=" + sid + suffix);
  }
}
