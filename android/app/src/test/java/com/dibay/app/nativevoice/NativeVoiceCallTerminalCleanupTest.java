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
import com.dibay.app.nativecall.NativeCallTerminalLifecycle;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

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
  public void terminalLifecycle_notStartedToInProgressToCompleted() {
    assertEquals(NativeCallTerminalLifecycle.Phase.NOT_STARTED, NativeVoiceCallTerminalOnce.phase("a"));
    assertTrue(NativeVoiceCallTerminalOnce.tryBegin("a"));
    assertEquals(NativeCallTerminalLifecycle.Phase.IN_PROGRESS, NativeVoiceCallTerminalOnce.phase("a"));
    assertFalse(NativeVoiceCallTerminalOnce.tryBegin("a"));
    NativeVoiceCallTerminalOnce.markCompleted("a");
    assertEquals(NativeCallTerminalLifecycle.Phase.COMPLETED, NativeVoiceCallTerminalOnce.phase("a"));
    assertFalse(NativeVoiceCallTerminalOnce.tryBegin("a"));
  }

  @Test
  public void localHangup_cleansImmediately_withoutHttpCallback() {
    String callId = "voice-hangup-a";
    putConnected(callId);

    NativeVoiceCallRuntime.end(context, callId);

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isCompleted(callId));
    assertEquals(1, patchCalls.get());
    assertNotNull(lastPatchCallback);
  }

  @Test
  public void duplicateDuringInProgress_doesNotParallelCleanup_andNotCompletedLog() {
    String callId = "voice-in-progress";
    putConnected(callId);
    assertTrue(NativeVoiceCallTerminalOnce.tryBegin(callId));

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");
    NativeVoiceCallRuntime.cleanup(context, callId, "repeat");

    assertNotNull("session remains until owner cleanup finishes", NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isInProgress(callId));
    assertFalse(NativeVoiceCallTerminalOnce.isCompleted(callId));
  }

  @Test
  public void duplicateAfterCompleted_safeNoOp() {
    String callId = "voice-completed";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);
    assertTrue(NativeVoiceCallTerminalOnce.isCompleted(callId));

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");
    NativeVoiceCallRuntime.cleanup(context, callId, "repeat");
    NativeVoiceCallRuntime.end(context, callId);

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
  }

  @Test
  public void leaveFailure_stillRunsMandatoryCleanup() {
    String callId = "voice-leave-fail";
    putConnected(callId);
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = false;
    NativeVoiceCallRuntime.injectLeaveFailureForTests = true;

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isCompleted(callId));
  }

  @Test
  public void fcmDuringEnding_beforeBegin_stillCleans() {
    String callId = "voice-fcm-ending";
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", true);
    session.state = NativeVoiceCallRuntime.State.ENDING;
    NativeVoiceCallRuntime.putSessionForTests(session);

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isCompleted(callId));
  }

  @Test
  public void remoteHangup_cleansWithoutLocalPatch() {
    String callId = "voice-remote";
    putConnected(callId);

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(0, patchCalls.get());
    assertTrue(NativeVoiceCallTerminalOnce.isCompleted(callId));
  }

  @Test
  public void pluginTerminalDuringCleanup_doesNotDoubleDestroy() {
    String callId = "voice-plugin";
    putConnected(callId);
    assertTrue(NativeVoiceCallTerminalOnce.tryBegin(callId));

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "plugin_end_call");

    assertTrue(NativeVoiceCallTerminalOnce.isInProgress(callId));
    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
  }

  @Test
  public void staleNotificationReopen_finishesActivity() {
    String callId = "voice-stale-reopen";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);

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

    assertTrue(controller.get().isFinishing());
    controller.pause().stop().destroy();
  }

  private void putConnected(String callId) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", true);
    session.state = NativeVoiceCallRuntime.State.CONNECTED;
    NativeVoiceCallRuntime.putSessionForTests(session);
  }
}
