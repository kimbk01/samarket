package com.dibay.app.nativevoice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Guard contract for Runtime boolean APIs: non-null skipReason ⇒ Runtime returns false without
 * treating Engine success as UI-ready.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class NativeVoiceCallRuntimeInPlaceMediaGuardTest {
  private static NativeVoiceCallRuntime.Session session(String callId, NativeVoiceCallRuntime.State state) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room-1", "caller-1", "Caller", "voice", true);
    session.state = state;
    return session;
  }

  /** Maps skipReason → Runtime boolean false (STEP 2c contract). */
  private static boolean runtimeWouldReturnFalse(String skipReason) {
    return skipReason != null;
  }

  @Test
  public void skip_whenSessionNull() {
    String reason = NativeVoiceCallRuntime.skipReasonForInPlaceMedia("call-1", null, "call-1");
    assertEquals("session_null", reason);
    assertTrue(runtimeWouldReturnFalse(reason));
  }

  @Test
  public void skip_whenNotConnected() {
    String reason =
        NativeVoiceCallRuntime.skipReasonForInPlaceMedia(
            "call-1", session("call-1", NativeVoiceCallRuntime.State.CONNECTING), "call-1");
    assertTrue(reason.startsWith("state_not_connected"));
    assertTrue(runtimeWouldReturnFalse(reason));
  }

  @Test
  public void skip_whenOccupantMismatch() {
    String reason =
        NativeVoiceCallRuntime.skipReasonForInPlaceMedia(
            "call-1",
            session("call-1", NativeVoiceCallRuntime.State.CONNECTED),
            "other-call");
    assertEquals("occupant_mismatch active=other-call", reason);
    assertTrue(runtimeWouldReturnFalse(reason));
  }

  @Test
  public void allow_whenConnectedAndOccupantMatches() {
    String reason =
        NativeVoiceCallRuntime.skipReasonForInPlaceMedia(
            "call-1",
            session("call-1", NativeVoiceCallRuntime.State.CONNECTED),
            "call-1");
    assertNull(reason);
    assertFalse(runtimeWouldReturnFalse(reason));
  }

  @Test
  public void allow_whenConnectedAndOccupantAbsent() {
    String reason =
        NativeVoiceCallRuntime.skipReasonForInPlaceMedia(
            "call-1", session("call-1", NativeVoiceCallRuntime.State.CONNECTED), null);
    assertNull(reason);
    assertFalse(runtimeWouldReturnFalse(reason));
  }
}
