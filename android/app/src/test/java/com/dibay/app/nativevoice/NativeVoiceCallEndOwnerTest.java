package com.dibay.app.nativevoice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.content.Context;
import android.os.Looper;
import androidx.test.core.app.ApplicationProvider;
import com.dibay.app.nativecall.NativeCallEndReason;
import com.dibay.app.nativecall.NativeCallTerminalEndOutbox;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * Bug A / A2 / B(a): durable end intent before Agora leave, survivor end on remote QUIT, task
 * removal end, and diagnostic clientEndedReason per trigger.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVoiceCallEndOwnerTest {
  private Context context;
  private final List<String> dispatched = new ArrayList<>();
  private final List<NativeVoiceCallApi.PatchCallback> callbacks = new ArrayList<>();
  private final List<Integer> outboxSizeAtDispatch = new ArrayList<>();

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativeVoiceCallRuntime.resetForTests();
    NativeCallTerminalEndOutbox.clearForTests(context);
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = true;
    dispatched.clear();
    callbacks.clear();
    outboxSizeAtDispatch.clear();
    NativeVoiceCallRuntime.terminalPatchDispatcherForTests =
        new NativeVoiceCallRuntime.TerminalPatchDispatcher() {
          @Override
          public void dispatch(
              Context app,
              String callId,
              String action,
              NativeVoiceCallApi.PatchCallback callback) {
            dispatch(app, callId, action, null, callback);
          }

          @Override
          public void dispatch(
              Context app,
              String callId,
              String action,
              String endReason,
              NativeVoiceCallApi.PatchCallback callback) {
            dispatched.add(callId + "|" + action + "|" + endReason);
            outboxSizeAtDispatch.add(NativeCallTerminalEndOutbox.snapshot(app).size());
            callbacks.add(callback);
          }
        };
  }

  @After
  public void tearDown() {
    NativeVoiceCallRuntime.resetForTests();
    NativeCallTerminalEndOutbox.clearForTests(context);
  }

  @Test
  public void end_recordsDurableIntentBeforePatch_andSettlesOnSuccess() {
    String callId = "voice-end-durable";
    put(callId, NativeVoiceCallRuntime.State.CONNECTED, true);

    NativeVoiceCallRuntime.end(context, callId, NativeCallEndReason.SOURCE_NOTIFICATION);

    assertEquals(1, dispatched.size());
    assertEquals(callId + "|end|" + NativeCallEndReason.NOTIFICATION_END, dispatched.get(0));
    assertEquals(Integer.valueOf(1), outboxSizeAtDispatch.get(0));
    callbacks.get(0).onDone(true, 200, null);
    assertTrue(NativeCallTerminalEndOutbox.snapshot(context).isEmpty());
    assertNull(NativeVoiceCallRuntime.getSession(callId));
  }

  @Test
  public void end_transportFailure_keepsOutboxEntry_forNextProcessStart() {
    String callId = "voice-end-lost";
    put(callId, NativeVoiceCallRuntime.State.CONNECTED, true);

    NativeVoiceCallRuntime.end(context, callId);
    callbacks.get(0).onDone(false, 0, "IOException");

    assertEquals(callId + "|end|" + NativeCallEndReason.USER_END, dispatched.get(0));
    assertNull(NativeVoiceCallRuntime.getSession(callId));
    List<NativeCallTerminalEndOutbox.Entry> left = NativeCallTerminalEndOutbox.snapshot(context);
    assertEquals(1, left.size());
    assertEquals(NativeCallTerminalEndOutbox.LANE_VOICE, left.get(0).lane);
  }

  @Test
  public void reject_doesNotUseEndOutbox() {
    String callId = "voice-reject";
    put(callId, NativeVoiceCallRuntime.State.RINGING, false);

    NativeVoiceCallRuntime.reject(context, callId);

    assertEquals(callId + "|reject|null", dispatched.get(0));
    assertTrue(NativeCallTerminalEndOutbox.snapshot(context).isEmpty());
  }

  @Test
  public void remoteQuit_whileConnected_cleansNow_andSendsServerEndAfterGrace() {
    String callId = "voice-remote-quit";
    put(callId, NativeVoiceCallRuntime.State.CONNECTED, false);

    NativeVoiceCallRuntime.onRemotePeerQuit(context, callId, "agora_user_offline_quit");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(dispatched.isEmpty());
    assertEquals(1, NativeCallTerminalEndOutbox.snapshot(context).size());

    shadowOf(Looper.getMainLooper())
        .idleFor(Duration.ofMillis(NativeCallTerminalEndOutbox.REMOTE_QUIT_END_GRACE_MS + 10));

    assertEquals(1, dispatched.size());
    assertEquals(callId + "|end|" + NativeCallEndReason.REMOTE_LEFT, dispatched.get(0));
    callbacks.get(0).onDone(true, 200, null);
    assertTrue(NativeCallTerminalEndOutbox.snapshot(context).isEmpty());
  }

  @Test
  public void remoteQuit_whileConnecting_isLocalCleanupOnly() {
    String callId = "voice-remote-quit-connecting";
    put(callId, NativeVoiceCallRuntime.State.CONNECTING, true);

    NativeVoiceCallRuntime.onRemotePeerQuit(context, callId, "agora_user_offline_quit");
    shadowOf(Looper.getMainLooper())
        .idleFor(Duration.ofMillis(NativeCallTerminalEndOutbox.REMOTE_QUIT_END_GRACE_MS + 10));

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(dispatched.isEmpty());
    assertTrue(NativeCallTerminalEndOutbox.snapshot(context).isEmpty());
  }

  private void put(String callId, NativeVoiceCallRuntime.State state, boolean initiator) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", initiator);
    session.state = state;
    NativeVoiceCallRuntime.putSessionForTests(session);
  }
}
