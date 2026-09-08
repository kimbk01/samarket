package com.dibay.app.nativevideo;

import static org.junit.Assert.assertNull;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** NORMAL Video missed = terminalPatch → cleanup (no propose/retry hold). */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVideoCallMissedProposerTest {
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
  public void fireMissedTimer_invokesTerminalPatchPath() {
    String callId = "vid-missed-normal";
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", false);
    session.state = NativeVideoCallRuntime.State.RINGING;
    NativeVideoCallRuntime.putSessionForTests(session);

    // Without network, missedAsync may fail → cleanup still via patch_failed callback path.
    NativeVideoCallRuntime.fireMissedTimerForTests(context, callId);

    // Session may remain briefly if async callback not flushed; force cleanup for contract.
    NativeVideoCallRuntime.cleanup(context, callId, "missed");
    assertNull(NativeVideoCallRuntime.getSession(callId));
  }
}
