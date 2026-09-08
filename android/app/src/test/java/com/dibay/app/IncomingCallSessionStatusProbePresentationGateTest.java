package com.dibay.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** CUT7 #6 — pure presentation gate (no network / Robolectric). */
public class IncomingCallSessionStatusProbePresentationGateTest {

  @Test
  public void ringing_allowsPresentation_evenIfServerWindowExpired() {
    assertTrue(IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation("ringing", false));
    assertTrue(IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation("ringing", true));
    assertTrue(IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation("RINGING", true));
  }

  @Test
  public void terminalStatuses_neverPresent() {
    String[] terminals = {"ended", "missed", "cancelled", "canceled", "rejected", "active"};
    for (String status : terminals) {
      assertFalse(
          status, IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation(status, false));
      assertFalse(
          status, IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation(status, true));
      assertTrue(status, IncomingCallSessionStatusProbe.isTerminalStatus(status));
    }
  }

  @Test
  public void probeNull_failOpenWhileServerWindowOpen_failClosedWhenExpired() {
    assertTrue(IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation(null, false));
    assertFalse(IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation(null, true));
  }

  @Test
  public void unknownStatus_sameAsProbeFailure() {
    assertTrue(IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation("unknown", false));
    assertFalse(IncomingCallSessionStatusProbe.shouldAllowIncomingPresentation("unknown", true));
  }

  @Test
  public void shouldProbe_isDelayGated_h1Normal() {
    assertFalse(IncomingCallSessionStatusProbe.shouldProbe(null));
  }
}
