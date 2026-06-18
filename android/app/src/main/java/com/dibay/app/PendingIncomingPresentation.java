package com.dibay.app;

import java.util.concurrent.ConcurrentHashMap;

/** Queues incoming UI delivery until ringing FGS has entered foreground (API 34+ call notification contract). */
public final class PendingIncomingPresentation {
  private static final ConcurrentHashMap<String, Entry> PENDING = new ConcurrentHashMap<>();

  private PendingIncomingPresentation() {}

  public static final class Entry {
    public final IncomingCallPayload payload;
    public final IncomingCallRouteDecision decision;

    Entry(IncomingCallPayload payload, IncomingCallRouteDecision decision) {
      this.payload = payload;
      this.decision = decision;
    }
  }

  public static void put(String callId, IncomingCallPayload payload, IncomingCallRouteDecision decision) {
    if (callId == null || callId.trim().isEmpty() || payload == null || decision == null) return;
    PENDING.put(callId.trim(), new Entry(payload, decision));
  }

  public static Entry peek(String callId) {
    if (callId == null || callId.trim().isEmpty()) return null;
    return PENDING.get(callId.trim());
  }

  public static Entry take(String callId) {
    if (callId == null || callId.trim().isEmpty()) return null;
    return PENDING.remove(callId.trim());
  }
}
