package com.dibay.app;

/** SSOT cleanup reasons — unknown / lifecycle-only reasons are forbidden for session termination. */
public enum IncomingCallCleanupReason {
  ACCEPTED("accepted"),
  REJECTED("rejected"),
  CALLER_CANCELLED("caller_cancelled"),
  MISSED_TIMEOUT("missed_timeout"),
  REMOTE_ENDED("remote_ended"),
  STALE_DUPLICATE_IGNORED("stale_duplicate_ignored"),
  APP_SHUTDOWN_SAFE_CLEAR("app_shutdown_safe_clear"),
  PERMISSION_DENIED("permission_denied"),
  MEDIA_FAILED_AFTER_ACCEPT("media_failed_after_accept");

  private static final long EARLY_RING_STOP_ALLOWED_MS = 1_000L;

  public final String wire;

  IncomingCallCleanupReason(String wire) {
    this.wire = wire;
  }

  public static IncomingCallCleanupReason fromWire(String value) {
    if (value == null) return null;
    String v = value.trim().toLowerCase();
    if (isForbiddenWire(v)) return null;
    for (IncomingCallCleanupReason r : values()) {
      if (r.wire.equals(v)) return r;
    }
    switch (v) {
      case "accept":
        return ACCEPTED;
      case "reject":
      case "declined":
        return REJECTED;
      case "cancelled":
      case "canceled":
        return CALLER_CANCELLED;
      case "missed":
        return MISSED_TIMEOUT;
      case "ended":
        return REMOTE_ENDED;
      default:
        return null;
    }
  }

  public static boolean isForbiddenWire(String value) {
    if (value == null) return true;
    String v = value.trim().toLowerCase();
    return "unknown".equals(v)
        || "generic_cleanup".equals(v)
        || "activity_destroyed".equals(v)
        || "notification_dismissed".equals(v);
  }

  /** Ring may stop within 1s only for these terminal user/server actions. */
  public boolean allowsEarlyRingStop() {
    return this == ACCEPTED || this == REJECTED || this == CALLER_CANCELLED;
  }

  public static long earlyRingStopAllowedMs() {
    return EARLY_RING_STOP_ALLOWED_MS;
  }
}
