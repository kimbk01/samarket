package com.dibay.app.nativecall;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.dibay.app.nativecall.NativeOutgoingWebGoneWatchPolicy.Kind;
import org.junit.Test;

public class NativeOutgoingWebGoneWatchPolicyTest {

  @Test
  public void terminalStatusesMatchWebAndIosSet() {
    for (String s : new String[] {"rejected", "cancelled", "canceled", "ended", "missed", "failed", " MISSED "}) {
      assertTrue(s, NativeOutgoingWebGoneWatchPolicy.isTerminalStatus(s));
    }
    for (String s : new String[] {"ringing", "active", "", null}) {
      assertFalse(String.valueOf(s), NativeOutgoingWebGoneWatchPolicy.isTerminalStatus(s));
    }
  }

  @Test
  public void terminalStatusDispatches() {
    assertEquals(Kind.TERMINAL, NativeOutgoingWebGoneWatchPolicy.decide(3_000L, true, 200, "missed").kind);
    assertEquals(Kind.TERMINAL, NativeOutgoingWebGoneWatchPolicy.decide(90_000L, true, 200, "rejected").kind);
  }

  @Test
  public void activeOrNoLongerEstablishingStops() {
    assertEquals(Kind.STOP, NativeOutgoingWebGoneWatchPolicy.decide(3_000L, true, 200, "active").kind);
    assertEquals(Kind.STOP, NativeOutgoingWebGoneWatchPolicy.decide(3_000L, false, 200, "missed").kind);
  }

  @Test
  public void ringingContinuesFastThenSlowThenStops() {
    NativeOutgoingWebGoneWatchPolicy.Decision fast =
        NativeOutgoingWebGoneWatchPolicy.decide(10_000L, true, 200, "ringing");
    assertEquals(Kind.CONTINUE, fast.kind);
    assertEquals(1_000L, fast.delayMs);
    NativeOutgoingWebGoneWatchPolicy.Decision slow =
        NativeOutgoingWebGoneWatchPolicy.decide(40_000L, true, 200, "ringing");
    assertEquals(Kind.CONTINUE, slow.kind);
    assertEquals(5_000L, slow.delayMs);
    assertEquals(Kind.STOP, NativeOutgoingWebGoneWatchPolicy.decide(180_000L, true, 200, "ringing").kind);
  }

  @Test
  public void failuresRetryAndRateLimitBacksOff() {
    assertEquals(Kind.CONTINUE, NativeOutgoingWebGoneWatchPolicy.decide(2_000L, true, 0, null).kind);
    assertEquals(Kind.CONTINUE, NativeOutgoingWebGoneWatchPolicy.decide(2_000L, true, 404, null).kind);
    NativeOutgoingWebGoneWatchPolicy.Decision limited =
        NativeOutgoingWebGoneWatchPolicy.decide(2_000L, true, 429, null);
    assertEquals(Kind.CONTINUE, limited.kind);
    assertEquals(5_000L, limited.delayMs);
    // 서버가 종료를 말했으면 시간 초과보다 우선
    assertEquals(Kind.TERMINAL, NativeOutgoingWebGoneWatchPolicy.decide(200_000L, true, 200, "ended").kind);
  }
}
