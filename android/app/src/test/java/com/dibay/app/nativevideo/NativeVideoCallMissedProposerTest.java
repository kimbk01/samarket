package com.dibay.app.nativevideo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** CUT7 Android Video missed proposer parity (A8/A9 + shared A1–A12 semantics). */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVideoCallMissedProposerTest {
  private Context context;
  private final AtomicInteger patchCalls = new AtomicInteger();
  private NativeVideoCallApi.PatchCallback lastPatchCallback;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativeVideoCallRuntime.resetForTests();
    NativeVideoCallRuntime.skipAgoraLeaveForTests = true;
    patchCalls.set(0);
    lastPatchCallback = null;
    NativeVideoCallRuntime.missedProposeDispatcherForTests =
        (app, callId, callback) -> {
          patchCalls.incrementAndGet();
          lastPatchCallback = callback;
        };
  }

  @After
  public void tearDown() {
    NativeVideoCallRuntime.resetForTests();
  }

  @Test
  public void a8_a9_videoParity_proposalOnly_thenRetry_thenCleanup() {
    String callId = "vd-missed-parity";
    putRinging(callId);

    NativeVideoCallRuntime.fireMissedTimerForTests(context, callId);
    assertEquals(1, patchCalls.get());
    assertNotNull(NativeVideoCallRuntime.getSession(callId));
    assertEquals(NativeVideoCallRuntime.State.RINGING, NativeVideoCallRuntime.getSession(callId).state);

    lastPatchCallback.onDone(false, 400, "ring_deadline_not_reached");
    assertNotNull(NativeVideoCallRuntime.getSession(callId));
    assertEquals(1, NativeVideoCallRuntime.missedRetryAttemptsForTests(callId));

    NativeVideoCallRuntime.advanceMissedRetryForTests(context, callId);
    assertEquals(2, patchCalls.get());
    lastPatchCallback.onDone(true, 200, null);

    assertNull(NativeVideoCallRuntime.getSession(callId));
    assertEquals(0, NativeVideoCallRuntime.missedRetryAttemptsForTests(callId));
  }

  @Test
  public void a12_videoRejectDuringRetry_noLaterMissedCleanup() {
    String callId = "vd-missed-a12";
    putRinging(callId);
    NativeVideoCallRuntime.fireMissedTimerForTests(context, callId);
    NativeVideoCallApi.PatchCallback early = lastPatchCallback;
    early.onDone(false, 400, "ring_deadline_not_reached");

    // Reject uses live network path; force remote cancel as terminal during retry.
    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "rejected", "user_reject");
    assertNull(NativeVideoCallRuntime.getSession(callId));

    NativeVideoCallRuntime.advanceMissedRetryForTests(context, callId);
    int before = patchCalls.get();
    if (lastPatchCallback != null && lastPatchCallback != early) {
      lastPatchCallback.onDone(true, 200, null);
    }
    assertEquals(before, patchCalls.get());
    assertNull(NativeVideoCallRuntime.getSession(callId));
  }

  private void putRinging(String callId) {
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", false);
    session.state = NativeVideoCallRuntime.State.RINGING;
    NativeVideoCallRuntime.putSessionForTests(session);
  }
}
