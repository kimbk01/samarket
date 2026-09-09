package com.dibay.app.nativevoice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import android.content.Intent;
import androidx.test.core.app.ApplicationProvider;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/** Wave-1 R1 / H1 NORMAL: terminalPatch → cleanup on callback (+ TerminalOnce). */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVoiceCallTerminalCleanupTest {
  private Context context;
  private final AtomicInteger patchCalls = new AtomicInteger();
  private NativeVoiceCallApi.PatchCallback lastPatchCallback;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativeVoiceCallRuntime.resetForTests();
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = true;
    patchCalls.set(0);
    lastPatchCallback = null;
    NativeVoiceCallRuntime.terminalPatchDispatcherForTests =
        (app, callId, action, callback) -> {
          patchCalls.incrementAndGet();
          lastPatchCallback = callback;
        };
  }

  @After
  public void tearDown() {
    NativeVoiceCallRuntime.resetForTests();
  }

  @Test
  public void terminalOnce_claimIsBooleanIdempotent() {
    assertFalse(NativeVoiceCallTerminalOnce.isClaimed("a"));
    assertTrue(NativeVoiceCallTerminalOnce.claim("a"));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed("a"));
    assertFalse(NativeVoiceCallTerminalOnce.claim("a"));
  }

  @Test
  public void localHangup_patchesFirst_thenCleansOnCallback() {
    String callId = "voice-hangup-a";
    putConnected(callId);

    NativeVoiceCallRuntime.end(context, callId);

    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void missed_patchesThenCleansOnCallback() {
    String callId = "voice-missed-a";
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", false);
    session.state = NativeVoiceCallRuntime.State.RINGING;
    NativeVoiceCallRuntime.putSessionForTests(session);

    NativeVoiceCallRuntime.missed(context, callId);

    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void duplicateAfterClaim_safeNoOp() {
    String callId = "voice-completed";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");
    NativeVoiceCallRuntime.cleanup(context, callId, "repeat");
    NativeVoiceCallRuntime.end(context, callId);

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
  }

  @Test
  public void leaveFailure_stillRunsCleanupFinish() {
    String callId = "voice-leave-fail";
    putConnected(callId);
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = false;
    NativeVoiceCallRuntime.injectLeaveFailureForTests = true;

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void remoteHangup_cleansWithoutLocalPatch() {
    String callId = "voice-remote";
    putConnected(callId);

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(0, patchCalls.get());
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void staleNotificationReopen_finishesActivity() {
    String callId = "voice-stale-reopen";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);

    Intent intent = new Intent(context, NativeVoiceCallActivity.class);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    ActivityController<NativeVoiceCallActivity> controller =
        Robolectric.buildActivity(NativeVoiceCallActivity.class, intent).setup();
    assertTrue(controller.get().isFinishing());
    controller.pause().stop().destroy();
  }

  @Test
  public void activityFinish_afterCleanup() {
    String callId = "voice-finish";
    putConnected(callId);
    Intent intent = new Intent(context, NativeVoiceCallActivity.class);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_UI_MODE, NativeVoiceCallActivity.UI_MODE_OUTGOING);
    ActivityController<NativeVoiceCallActivity> controller =
        Robolectric.buildActivity(NativeVoiceCallActivity.class, intent).setup();
    assertFalse(controller.get().isFinishing());

    NativeVoiceCallRuntime.end(context, callId);
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);

    assertTrue(controller.get().isFinishing());
    controller.pause().stop().destroy();
  }

  @Test
  public void newOutgoing_supersedesPriorLiveConnectingSession() {
    String prior = "voice-prior-live";
    NativeVoiceCallRuntime.Session priorSession =
        new NativeVoiceCallRuntime.Session(prior, "room", "peer", "Peer", "voice", true);
    priorSession.state = NativeVoiceCallRuntime.State.CONNECTING;
    NativeVoiceCallRuntime.putSessionForTests(priorSession);
    NativeVoiceCallOwner.claimNative(prior, "test");

    assertEquals(prior, NativeVoiceCallRuntime.findOtherLiveSessionCallId("voice-new"));

    NativeVoiceCallRuntime.handleOutgoing(
        context, "voice-new", "room2", "peer2", "Peer2", "voice");

    assertNull(NativeVoiceCallRuntime.getSession(prior));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(prior));
    assertNotNull(NativeVoiceCallRuntime.getSession("voice-new"));
    assertNull(NativeVoiceCallRuntime.findOtherLiveSessionCallId("voice-new"));
  }

  private void putConnected(String callId) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", true);
    session.state = NativeVoiceCallRuntime.State.CONNECTED;
    NativeVoiceCallRuntime.putSessionForTests(session);
  }
}
