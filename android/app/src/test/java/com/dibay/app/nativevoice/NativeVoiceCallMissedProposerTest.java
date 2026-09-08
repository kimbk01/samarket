package com.dibay.app.nativevoice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * CUT7 Android Voice missed proposer — A1–A12 (canonical server authority).
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVoiceCallMissedProposerTest {
  private Context context;
  private final AtomicInteger patchCalls = new AtomicInteger();
  private final List<String> patchActions = new ArrayList<>();
  private NativeVoiceCallApi.PatchCallback lastPatchCallback;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativeVoiceCallRuntime.resetForTests();
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = true;
    patchCalls.set(0);
    patchActions.clear();
    lastPatchCallback = null;
    NativeVoiceCallRuntime.terminalPatchDispatcherForTests =
        (app, callId, action, callback) -> {
          patchCalls.incrementAndGet();
          patchActions.add(action);
          lastPatchCallback = callback;
        };
  }

  @After
  public void tearDown() {
    NativeVoiceCallRuntime.resetForTests();
  }

  @Test
  public void a1_timerFires_proposalOnly_keepsSession() {
    String callId = "v-missed-a1";
    putRinging(callId);

    NativeVoiceCallRuntime.fireMissedTimerForTests(context, callId);

    assertEquals(1, patchCalls.get());
    assertEquals("missed", patchActions.get(0));
    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(NativeVoiceCallRuntime.State.RINGING, NativeVoiceCallRuntime.getSession(callId).state);
    assertNull("cleanup must wait for accept", claimOrNull(callId));
  }

  @Test
  public void a2_a3_a4_earlyReject_keepsPresentation_schedulesRetry() {
    String callId = "v-missed-a2";
    putRinging(callId);
    NativeVoiceCallRuntime.fireMissedTimerForTests(context, callId);
    lastPatchCallback.onDone(false, 400, "ring_deadline_not_reached");

    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(NativeVoiceCallRuntime.State.RINGING, NativeVoiceCallRuntime.getSession(callId).state);
    assertEquals(1, NativeVoiceCallRuntime.missedRetryAttemptsForTests(callId));
  }

  @Test
  public void a5_a6_acceptedMissed_triggersCleanupOnce() {
    String callId = "v-missed-a5";
    putRinging(callId);
    NativeVoiceCallRuntime.fireMissedTimerForTests(context, callId);
    lastPatchCallback.onDone(true, 200, null);

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));

    NativeVoiceCallRuntime.cleanup(context, callId, "missed_repeat");
    assertEquals(1, patchCalls.get());
  }

  @Test
  public void a7_ringOwnerStopOnlyOnAccepted_orRemoteTerminal() {
    String callId = "v-missed-a7";
    putRinging(callId);
    NativeVoiceCallRuntime.fireMissedTimerForTests(context, callId);
    lastPatchCallback.onDone(false, 400, "ring_deadline_not_reached");
    assertNotNull(NativeVoiceCallRuntime.getSession(callId));

    lastPatchCallback = null;
    NativeVoiceCallRuntime.advanceMissedRetryForTests(context, callId);
    assertEquals(2, patchCalls.get());
    lastPatchCallback.onDone(true, 200, null);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
  }

  @Test
  public void a10_terminalDuringRetry_cancelsRetrySafely() {
    String callId = "v-missed-a10";
    putRinging(callId);
    NativeVoiceCallRuntime.fireMissedTimerForTests(context, callId);
    lastPatchCallback.onDone(false, 400, "ring_deadline_not_reached");
    assertEquals(1, NativeVoiceCallRuntime.missedRetryAttemptsForTests(callId));

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "cancelled", "fcm:call_canceled");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(0, NativeVoiceCallRuntime.missedRetryAttemptsForTests(callId));
    int before = patchCalls.get();
    NativeVoiceCallRuntime.advanceMissedRetryForTests(context, callId);
    assertEquals(before, patchCalls.get());
  }

  @Test
  public void a11_acceptDuringRetry_cancelsMissedRetry() {
    String callId = "v-missed-a11";
    putRinging(callId);
    NativeVoiceCallRuntime.fireMissedTimerForTests(context, callId);
    lastPatchCallback.onDone(false, 400, "ring_deadline_not_reached");

    NativeVoiceCallRuntime.accept(context, callId);

    assertEquals(NativeVoiceCallRuntime.State.ACCEPTING, NativeVoiceCallRuntime.getSession(callId).state);
    assertEquals(0, NativeVoiceCallRuntime.missedRetryAttemptsForTests(callId));
    int before = patchCalls.get();
    NativeVoiceCallRuntime.advanceMissedRetryForTests(context, callId);
    assertEquals(before, patchCalls.get());
  }

  @Test
  public void a12_rejectDuringRetry_doesNotLaterMissedCleanup() {
    String callId = "v-missed-a12";
    putRinging(callId);
    NativeVoiceCallRuntime.fireMissedTimerForTests(context, callId);
    NativeVoiceCallApi.PatchCallback early = lastPatchCallback;
    early.onDone(false, 400, "ring_deadline_not_reached");

    NativeVoiceCallRuntime.reject(context, callId);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));

    // Stale early-reject retry must not resurrect / re-clean as missed.
    NativeVoiceCallRuntime.advanceMissedRetryForTests(context, callId);
    if (lastPatchCallback != null && lastPatchCallback != early) {
      lastPatchCallback.onDone(true, 200, null);
    }
    assertNull(NativeVoiceCallRuntime.getSession(callId));
  }

  private Boolean claimOrNull(String callId) {
    return NativeVoiceCallTerminalOnce.isClaimed(callId) ? Boolean.TRUE : null;
  }

  private void putRinging(String callId) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", false);
    session.state = NativeVoiceCallRuntime.State.RINGING;
    NativeVoiceCallRuntime.putSessionForTests(session);
  }
}
