package com.dibay.app.nativevideo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import com.dibay.app.nativecall.NativeCallTerminalLifecycle;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVideoCallTerminalCleanupTest {
  private Context context;

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativeVideoCallRuntime.resetForTests();
    NativeVideoCallRuntime.skipAgoraLeaveForTests = true;
  }

  @After
  public void tearDown() {
    NativeVideoCallRuntime.resetForTests();
  }

  @Test
  public void remoteTerminal_completesLifecycle() {
    String callId = "video-remote";
    putConnected(callId);

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVideoCallRuntime.getSession(callId));
    assertTrue(NativeCallTerminalLifecycle.isCompleted(callId));
  }

  @Test
  public void duplicateDuringInProgress_noParallelCleanup() {
    String callId = "video-in-progress";
    putConnected(callId);
    assertTrue(NativeCallTerminalLifecycle.tryBegin(callId));

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "plugin_end_call");
    NativeVideoCallRuntime.cleanup(context, callId, "repeat");

    assertEquals(NativeCallTerminalLifecycle.Phase.IN_PROGRESS, NativeCallTerminalLifecycle.phase(callId));
    assertFalse(NativeCallTerminalLifecycle.isCompleted(callId));
  }

  @Test
  public void leaveFailure_stillCompletesMandatoryCleanup() {
    String callId = "video-leave-fail";
    putConnected(callId);
    NativeVideoCallRuntime.skipAgoraLeaveForTests = false;
    NativeVideoCallRuntime.injectLeaveFailureForTests = true;

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVideoCallRuntime.getSession(callId));
    assertTrue(NativeCallTerminalLifecycle.isCompleted(callId));
  }

  @Test
  public void endingStateAlone_doesNotBlockCleanup() {
    String callId = "video-ending-recover";
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", true);
    session.state = NativeVideoCallRuntime.State.ENDING;
    NativeVideoCallRuntime.putSessionForTests(session);

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVideoCallRuntime.getSession(callId));
    assertTrue(NativeCallTerminalLifecycle.isCompleted(callId));
  }

  @Test
  public void voiceVideoShareSameLifecycleAuthority() {
    String callId = "shared-lifecycle";
    assertTrue(NativeCallTerminalLifecycle.tryBegin(callId));
    putConnected(callId);

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertEquals(NativeCallTerminalLifecycle.Phase.IN_PROGRESS, NativeCallTerminalLifecycle.phase(callId));
  }

  private void putConnected(String callId) {
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", true);
    session.state = NativeVideoCallRuntime.State.CONNECTED;
    NativeVideoCallRuntime.putSessionForTests(session);
  }
}
