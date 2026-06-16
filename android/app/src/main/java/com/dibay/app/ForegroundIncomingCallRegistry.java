package com.dibay.app;

/** Tracks the active in-app (foreground) native incoming pill — Web banner fallback gate. */
public final class ForegroundIncomingCallRegistry {
  private static volatile String activeCallId;

  private ForegroundIncomingCallRegistry() {}

  public static void setActive(String callId) {
    if (callId == null || callId.trim().isEmpty()) {
      activeCallId = null;
      return;
    }
    activeCallId = callId.trim();
  }

  public static void clear(String callId) {
    if (callId == null || callId.trim().isEmpty()) return;
    String sid = callId.trim();
    if (sid.equals(activeCallId)) {
      activeCallId = null;
    }
  }

  public static String getActiveCallId() {
    return activeCallId;
  }
}
