package com.dibay.app;

import java.util.concurrent.ConcurrentHashMap;

/** Queues incoming-call UI until ringing FGS has entered foreground (API 34+ CallStyle contract). */
public final class PendingIncomingPresentation {
  private static final ConcurrentHashMap<String, IncomingCallPayload> PENDING = new ConcurrentHashMap<>();

  private PendingIncomingPresentation() {}

  public static void put(IncomingCallPayload payload) {
    if (payload == null || !payload.isValid()) return;
    PENDING.put(payload.callId.trim(), payload);
  }

  public static IncomingCallPayload take(String callId) {
    if (callId == null || callId.trim().isEmpty()) return null;
    return PENDING.remove(callId.trim());
  }
}
