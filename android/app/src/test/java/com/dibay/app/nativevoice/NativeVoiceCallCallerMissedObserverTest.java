package com.dibay.app.nativevoice;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;

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
public class NativeVoiceCallCallerMissedObserverTest {
  private Context context;

  @Before
  public void setUp() {
    Application app = ApplicationProvider.getApplicationContext();
    context = app.getApplicationContext();
    NativeVoiceCallRuntime.resetForTests();
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = true;
  }

  @After
  public void tearDown() {
    NativeVoiceCallRuntime.resetForTests();
  }

  @Test
  public void callerConnectingAppliesServerMissedTerminal() {
    NativeVoiceCallRuntime.putSessionForTests(
        new NativeVoiceCallRuntime.Session(
            "call-missed-1", "room-1", "peer-1", "Peer", "voice", true));

    NativeVoiceCallRuntime.handleOutgoingTerminalObserverStatusForTests(
        context, "call-missed-1", "missed");

    assertNull(NativeVoiceCallRuntime.getSession("call-missed-1"));
    assertEquals(
        NativeCallTerminalLifecycle.Phase.COMPLETED,
        NativeVoiceCallTerminalOnce.phase("call-missed-1"));
  }

  @Test
  public void callerConnectingIgnoresNonTerminalRingingStatus() {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(
            "call-ringing-1", "room-1", "peer-1", "Peer", "voice", true);
    NativeVoiceCallRuntime.putSessionForTests(session);

    NativeVoiceCallRuntime.handleOutgoingTerminalObserverStatusForTests(
        context, "call-ringing-1", "ringing");

    assertSame(session, NativeVoiceCallRuntime.getSession("call-ringing-1"));
    assertEquals(NativeVoiceCallRuntime.State.CONNECTING, session.state);
  }

  @Test
  public void duplicateMissedTerminalRemainsIdempotent() {
    NativeVoiceCallRuntime.putSessionForTests(
        new NativeVoiceCallRuntime.Session(
            "call-dup-1", "room-1", "peer-1", "Peer", "voice", true));

    NativeVoiceCallRuntime.handleOutgoingTerminalObserverStatusForTests(
        context, "call-dup-1", "missed");
    NativeVoiceCallRuntime.onRemoteTerminal(context, "call-dup-1", "missed", "duplicate");

    assertNull(NativeVoiceCallRuntime.getSession("call-dup-1"));
    assertEquals(
        NativeCallTerminalLifecycle.Phase.COMPLETED,
        NativeVoiceCallTerminalOnce.phase("call-dup-1"));
  }
}
