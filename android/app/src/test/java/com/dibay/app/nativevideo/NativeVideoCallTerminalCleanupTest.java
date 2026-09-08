package com.dibay.app.nativevideo;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** NORMAL Video cleanup/finish — no TerminalLifecycle phase machine. */
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
  public void remoteTerminal_cleansAndRemovesSession() {
    String callId = "video-remote";
    putConnected(callId);

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVideoCallRuntime.getSession(callId));
  }

  @Test
  public void leaveFailure_stillRunsCleanupFinish() {
    String callId = "video-leave-fail";
    putConnected(callId);
    NativeVideoCallRuntime.skipAgoraLeaveForTests = false;
    NativeVideoCallRuntime.injectLeaveFailureForTests = true;

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVideoCallRuntime.getSession(callId));
  }

  @Test
  public void endingState_skipsRemoteTerminal_likeNormal() {
    String callId = "video-ending";
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", true);
    session.state = NativeVideoCallRuntime.State.ENDING;
    NativeVideoCallRuntime.putSessionForTests(session);

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    // NORMAL: ENDING skips onRemoteTerminal; explicit cleanup still works.
    assertNotNull(NativeVideoCallRuntime.getSession(callId));
    assertEquals(NativeVideoCallRuntime.State.ENDING, NativeVideoCallRuntime.getSession(callId).state);

    NativeVideoCallRuntime.cleanup(context, callId, "ended");
    assertNull(NativeVideoCallRuntime.getSession(callId));
  }

  @Test
  public void duplicateCleanup_isSafe() {
    String callId = "video-dup";
    putConnected(callId);
    NativeVideoCallRuntime.cleanup(context, callId, "ended");
    NativeVideoCallRuntime.cleanup(context, callId, "ended_again");
    assertNull(NativeVideoCallRuntime.getSession(callId));
  }

  private void putConnected(String callId) {
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", true);
    session.state = NativeVideoCallRuntime.State.CONNECTED;
    NativeVideoCallRuntime.putSessionForTests(session);
  }
}
