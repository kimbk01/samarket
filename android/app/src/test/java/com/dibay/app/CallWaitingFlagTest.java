package com.dibay.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/** 대기 통화 표시 읽기 — docs/audit/call-waiting-stage2-design-2026-11-15.md WA1. */
public class CallWaitingFlagTest {
  private static Map<String, String> base() {
    Map<String, String> m = new HashMap<>();
    m.put("callId", "c1");
    m.put("roomId", "r1");
    m.put("callerId", "u1");
    m.put("callType", "voice");
    return m;
  }

  @Test
  public void waitingTrueOnlyForTrueOrOne() {
    for (String v : new String[] {"true", "TRUE", "1"}) {
      Map<String, String> m = base();
      m.put("waiting", v);
      assertTrue(v, FcmPayloadResolver.resolveIncomingCallPayload(m, null, null).waiting);
    }
    for (String v : new String[] {"false", "0", "", "yes"}) {
      Map<String, String> m = base();
      m.put("waiting", v);
      assertFalse(v, FcmPayloadResolver.resolveIncomingCallPayload(m, null, null).waiting);
    }
    assertFalse(FcmPayloadResolver.resolveIncomingCallPayload(base(), null, null).waiting);
  }

  @Test
  public void waitingSurvivesExpiresAtRefresh() {
    Map<String, String> m = base();
    m.put("waiting", "true");
    IncomingCallPayload p = FcmPayloadResolver.resolveIncomingCallPayload(m, null, null);
    assertTrue(p.withExpiresAt("2026-11-15T00:00:00Z").waiting);
  }
}
