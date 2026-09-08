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
  public void terminalOnce_endingIsNotCleanupComplete() {
    assertFalse(NativeVoiceCallTerminalOnce.isClaimed("a"));
    assertTrue(NativeVoiceCallTerminalOnce.claim("a"));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed("a"));
    assertFalse(NativeVoiceCallTerminalOnce.claim("a"));
  }

  @Test
  public void localHangup_cleansImmediately_withoutHttpCallback() {
    String callId = "voice-hangup-a";
    putConnected(callId);

    NativeVoiceCallRuntime.end(context, callId);

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
    assertEquals(1, patchCalls.get());
    assertNotNull(lastPatchCallback);
    assertNull(NativeVoiceCallRuntime.findOtherLiveSessionCallId("other"));
    assertNull(NativeVoiceCallRuntime.findStaleSessionCallId("other"));
  }

  @Test
  public void patchSuccess_afterLocalCleanup_doesNotRecreateSession() {
    String callId = "voice-patch-ok";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);
    assertNull(NativeVoiceCallRuntime.getSession(callId));

    lastPatchCallback.onDone(true, 200, null);

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
  }

  @Test
  public void patchFail_doesNotBlockLocalCleanup() {
    String callId = "voice-patch-fail";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);
    lastPatchCallback.onDone(false, 500, "forced");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void patchHang_stillReleasesLocalTerminal() {
    String callId = "voice-patch-hang";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);

    assertNull("HTTP hang must not keep session", NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
    assertEquals(1, patchCalls.get());
  }

  @Test
  public void fcmDuringEnding_doesNotSkipCleanup() {
    String callId = "voice-fcm-ending";
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", true);
    session.state = NativeVoiceCallRuntime.State.ENDING;
    NativeVoiceCallRuntime.putSessionForTests(session);

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
    assertEquals(0, patchCalls.get());
  }

  @Test
  public void remoteHangup_cleansWithoutLocalPatch() {
    String callId = "voice-remote";
    putConnected(callId);

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(0, patchCalls.get());
  }

  @Test
  public void cleanup_isIdempotent_acrossHangupAndFcm() {
    String callId = "voice-idempotent";
    putConnected(callId);

    NativeVoiceCallRuntime.end(context, callId);
    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");
    NativeVoiceCallRuntime.end(context, callId);
    NativeVoiceCallRuntime.cleanup(context, callId, "repeat");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
  }

  @Test
  public void callStyleAndDockHangup_useSameEndAuthority() {
    String callId = "voice-same-authority";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void nextIncoming_isNotBusySuppressedByCleanedCall() {
    String ended = "voice-ended-a";
    putConnected(ended);
    NativeVoiceCallRuntime.end(context, ended);

    assertNull(NativeVoiceCallRuntime.findOtherLiveSessionCallId("voice-incoming-b"));
    assertNull(NativeVoiceCallRuntime.findStaleSessionCallId("voice-incoming-b"));
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

  private void putConnected(String callId) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", true);
    session.state = NativeVoiceCallRuntime.State.CONNECTED;
    NativeVoiceCallRuntime.putSessionForTests(session);
  }
}
