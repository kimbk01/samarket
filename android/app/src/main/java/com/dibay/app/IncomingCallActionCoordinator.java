package com.dibay.app;

import android.util.Log;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/** Single-flight guard for native incoming call accept/decline actions. */
public final class IncomingCallActionCoordinator {
  private static final String TAG = "DIBAY_CALL_FLOW";
  private static final long TTL_MS = 60_000L;
  private static final ConcurrentHashMap<String, Long> IN_FLIGHT = new ConcurrentHashMap<>();

  private IncomingCallActionCoordinator() {}

  public static boolean tryBegin(String callId, String action) {
    if (callId == null || callId.trim().isEmpty()) return false;
    if (action == null || action.trim().isEmpty()) return false;
    cleanupExpired();
    String key = callId.trim() + ":" + action.trim();
    long now = System.currentTimeMillis();
    Long prev = IN_FLIGHT.putIfAbsent(key, now);
    if (prev != null) {
      Log.i(TAG, "[call-flow] duplicate_" + action + "_blocked callId=" + callId);
      return false;
    }
    return true;
  }

  public static void end(String callId, String action) {
    if (callId == null || action == null) return;
    IN_FLIGHT.remove(callId.trim() + ":" + action.trim());
  }

  private static void cleanupExpired() {
    long now = System.currentTimeMillis();
    for (Map.Entry<String, Long> entry : IN_FLIGHT.entrySet()) {
      if (now - entry.getValue() > TTL_MS) {
        IN_FLIGHT.remove(entry.getKey(), entry.getValue());
      }
    }
  }
}
