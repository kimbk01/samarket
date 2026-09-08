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

/** NORMAL Voice missed = immediate beginLocalTerminal cleanup + best-effort PATCH. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, application = Application.class)
public class NativeVoiceCallMissedProposerTest {
  private Context context;
  private final AtomicInteger patchCalls = new AtomicInteger();
  private final List<String> patchActions = new ArrayList<>();

  @Before
  public void setUp() {
    context = ApplicationProvider.getApplicationContext();
    NativeVoiceCallRuntime.resetForTests();
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = true;
    patchCalls.set(0);
    patchActions.clear();
    NativeVoiceCallRuntime.terminalPatchDispatcherForTests =
        (app, callId, action, callback) -> {
          patchCalls.incrementAndGet();
          patchActions.add(action);
          callback.onDone(true, 200, null);
        };
  }

  @After
  public void tearDown() {
    NativeVoiceCallRuntime.resetForTests();
  }

  @Test
  public void timerOrMissed_cleansImmediately_andPatchesBestEffort() {
    String callId = "v-missed-normal";
    putRinging(callId);

    NativeVoiceCallRuntime.fireMissedTimerForTests(context, callId);

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
    assertEquals(1, patchCalls.get());
    assertEquals("missed", patchActions.get(0));
  }

  private void putRinging(String callId) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", false);
    session.state = NativeVoiceCallRuntime.State.RINGING;
    NativeVoiceCallRuntime.putSessionForTests(session);
  }
}
