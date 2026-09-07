package com.dibay.app;

/**
 * Push-route consume ACK equality — no Android framework deps (unit-testable).
 * Contract: ACKED_ROUTE == PENDING_ROUTE after normalize (no prefix / empty ACK).
 */
public final class PushRouteAckMatch {
  private PushRouteAckMatch() {}

  /** Normalize app path for push ACK equality (trim, drop hash, drop trailing slash). */
  public static String normalize(String path) {
    if (path == null) return "";
    String p = path.trim();
    if (p.isEmpty()) return "";
    int hash = p.indexOf('#');
    if (hash >= 0) p = p.substring(0, hash);
    if (!p.startsWith("/")) return "";
    if (p.length() > 1 && p.endsWith("/")) {
      p = p.substring(0, p.length() - 1);
    }
    return p;
  }

  /**
   * ACKED_ROUTE == PENDING_ROUTE after normalize. Prefix / parent routes must not match.
   * Query: same pathname allowed when at most one side carries a query (canonical room id).
   */
  public static boolean matches(String ackPath, String pendingPath) {
    String ack = normalize(ackPath);
    String pending = normalize(pendingPath);
    if (ack.isEmpty() || pending.isEmpty()) return false;
    if (ack.equals(pending)) return true;
    String ackOnly = ack.split("\\?", 2)[0];
    String pendingOnly = pending.split("\\?", 2)[0];
    if (!ackOnly.equals(pendingOnly)) return false;
    boolean ackHasQuery = ack.indexOf('?') >= 0;
    boolean pendingHasQuery = pending.indexOf('?') >= 0;
    return !ackHasQuery || !pendingHasQuery;
  }
}
