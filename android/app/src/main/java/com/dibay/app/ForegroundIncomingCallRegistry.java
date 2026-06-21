package com.dibay.app;

/** Legacy native foreground pill registry — no-op; Web IncomingCallSurface is SSOT. */
public final class ForegroundIncomingCallRegistry {
  private ForegroundIncomingCallRegistry() {}

  public static void setActive(String callId) {}

  public static void clear(String callId) {}

  public static String getActiveCallId() {
    return null;
  }
}
