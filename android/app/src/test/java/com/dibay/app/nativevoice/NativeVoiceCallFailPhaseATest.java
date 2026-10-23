package com.dibay.app.nativevoice;

import static org.junit.Assert.assertEquals;
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
 * E-C2-B Phase A — outgoing Voice fail attaches TRUSTED clientEndedReason only when proven;
 * normal end/reject/missed and CONNECTED fail stay legacy.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVoiceCallFailPhaseATest {
  private Context context;
  private final AtomicInteger patchCalls = new AtomicInteger();
  private final List<String> patchActions = new ArrayList<>();
  private final List<String> patchClientEndedReasons = new ArrayList<>();
  private NativeVoiceCallApi.PatchCallback lastPatchCallback;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativeVoiceCallRuntime.resetForTests();
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = true;
    patchCalls.set(0);
    patchActions.clear();
    patchClientEndedReasons.clear();
    lastPatchCallback = null;
    NativeVoiceCallRuntime.terminalPatchDispatcherForTests =
        (app, callId, action, clientEndedReason, callback) -> {
          patchCalls.incrementAndGet();
          patchActions.add(action);
          patchClientEndedReasons.add(clientEndedReason);
          lastPatchCallback = callback;
        };
  }

  @After
  public void tearDown() {
    NativeVoiceCallRuntime.resetForTests();
  }

  @Test
  public void outgoingConnecting_tokenFetchFailed_endWithFailedSignaling() {
    String callId = "voice-out-token-fail";
    putOutgoing(callId, NativeVoiceCallRuntime.State.CONNECTING);

    NativeVoiceCallRuntime.failForTests(context, callId, "token_fetch_failed no_server_origin");

    assertEquals(1, patchCalls.get());
    assertEquals("end", patchActions.get(0));
    assertEquals("failed_signaling", patchClientEndedReasons.get(0));
    lastPatchCallback.onDone(true, 200, null);
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void outgoingConnecting_agoraError_endWithoutClientEndedReason() {
    String callId = "voice-out-agora-fail";
    putOutgoing(callId, NativeVoiceCallRuntime.State.CONNECTING);

    NativeVoiceCallRuntime.failForTests(context, callId, "agora error=101");

    assertEquals(1, patchCalls.get());
    assertEquals("end", patchActions.get(0));
    assertNull(patchClientEndedReasons.get(0));
  }

  @Test
  public void outgoingConnected_tokenFetchFailed_doesNotAttachPhaseAReason() {
    String callId = "voice-out-connected-fail";
    putOutgoing(callId, NativeVoiceCallRuntime.State.CONNECTED);

    NativeVoiceCallRuntime.failForTests(context, callId, "token_fetch_failed late");

    assertEquals(1, patchCalls.get());
    assertEquals("end", patchActions.get(0));
    assertNull(patchClientEndedReasons.get(0));
  }

  @Test
  public void incomingRinging_fail_stillRejectWithoutClientEndedReason() {
    String callId = "voice-in-fail";
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", false);
    session.state = NativeVoiceCallRuntime.State.RINGING;
    NativeVoiceCallRuntime.putSessionForTests(session);

    NativeVoiceCallRuntime.failForTests(context, callId, "token_fetch_failed x");

    assertEquals(1, patchCalls.get());
    assertEquals("reject", patchActions.get(0));
    assertNull(patchClientEndedReasons.get(0));
  }

  @Test
  public void userEnd_noClientEndedReason() {
    String callId = "voice-user-end";
    putOutgoing(callId, NativeVoiceCallRuntime.State.CONNECTED);

    NativeVoiceCallRuntime.end(context, callId);

    assertEquals(1, patchCalls.get());
    assertEquals("end", patchActions.get(0));
    assertNull(patchClientEndedReasons.get(0));
  }

  @Test
  public void userReject_noClientEndedReason() {
    String callId = "voice-user-reject";
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", false);
    session.state = NativeVoiceCallRuntime.State.RINGING;
    NativeVoiceCallRuntime.putSessionForTests(session);

    NativeVoiceCallRuntime.reject(context, callId);

    assertEquals(1, patchCalls.get());
    assertEquals("reject", patchActions.get(0));
    assertNull(patchClientEndedReasons.get(0));
  }

  @Test
  public void failThenDuplicateFail_singlePatch() {
    String callId = "voice-out-dup-fail";
    putOutgoing(callId, NativeVoiceCallRuntime.State.CONNECTING);

    NativeVoiceCallRuntime.failForTests(context, callId, "token_fetch_failed a");
    assertEquals(1, patchCalls.get());
    lastPatchCallback.onDone(true, 200, null);

    NativeVoiceCallRuntime.failForTests(context, callId, "token_fetch_failed b");
    assertEquals(1, patchCalls.get());
  }

  private static void putOutgoing(String callId, NativeVoiceCallRuntime.State state) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", true);
    session.state = state;
    NativeVoiceCallRuntime.putSessionForTests(session);
  }
}
