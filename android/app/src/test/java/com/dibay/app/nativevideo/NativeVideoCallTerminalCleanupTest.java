package com.dibay.app.nativevideo;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Context;
import androidx.test.core.app.ApplicationProvider;
import com.dibay.app.nativecall.NativeCallEndReason;
import com.dibay.app.nativecall.NativeCallTerminalEndOutbox;
import java.util.List;
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
    NativeCallTerminalEndOutbox.clearForTests(context);
    NativeVideoCallRuntime.skipAgoraLeaveForTests = true;
  }

  @After
  public void tearDown() {
    NativeVideoCallRuntime.resetForTests();
    NativeCallTerminalEndOutbox.clearForTests(context);
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
  public void endingState_convergesCleanup_idempotent() {
    String callId = "video-ending";
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", true);
    session.state = NativeVideoCallRuntime.State.ENDING;
    NativeVideoCallRuntime.putSessionForTests(session);

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

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

  @Test
  public void remotePeerLeft_convergesCleanup_likeRemoteTerminal() {
    String callId = "video-agora-peer-left";
    putConnected(callId);

    NativeVideoCallRuntime.onRemoteTerminal(context, callId, "ended", "agora_user_offline_quit");

    assertNull(NativeVideoCallRuntime.getSession(callId));
  }

  @Test
  public void agoraRemoteQuit_whileConnected_cleansAndRecordsServerEnd() {
    String callId = "video-agora-quit-connected";
    putConnected(callId);

    NativeVideoCallRuntime.onRemotePeerQuit(context, callId, "agora_user_offline_quit");

    assertNull(NativeVideoCallRuntime.getSession(callId));
    List<NativeCallTerminalEndOutbox.Entry> pending = NativeCallTerminalEndOutbox.snapshot(context);
    assertEquals(1, pending.size());
    assertEquals(callId, pending.get(0).callId);
    assertEquals(NativeCallTerminalEndOutbox.LANE_VIDEO, pending.get(0).lane);
    assertEquals(NativeCallEndReason.REMOTE_LEFT, pending.get(0).reason);
  }

  @Test
  public void agoraRemoteQuit_whileNotConnected_isLocalCleanupOnly() {
    String callId = "video-agora-quit-connecting";
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", true);
    session.state = NativeVideoCallRuntime.State.CONNECTING;
    NativeVideoCallRuntime.putSessionForTests(session);

    NativeVideoCallRuntime.onRemotePeerQuit(context, callId, "agora_user_offline_quit");

    assertNull(NativeVideoCallRuntime.getSession(callId));
    assertTrue(NativeCallTerminalEndOutbox.snapshot(context).isEmpty());
  }

  @Test
  public void activeConnected_isNotReclaimedByPrepareJoin() {
    String live = "video-live-active";
    putConnected(live);
    com.dibay.app.nativecall.NativeCallEngineOwnership.GuardOutcome busy =
        com.dibay.app.nativecall.NativeCallEngineOwnership.prepareJoin(
            context, "video-other", com.dibay.app.nativecall.NativeCallEngineOwnership.JoinLane.VIDEO);
    assertNotNull(NativeVideoCallRuntime.getSession(live));
    assertEquals(
        com.dibay.app.nativecall.NativeCallEngineOwnership.GuardOutcome.BUSY, busy);
  }

  private void putConnected(String callId) {
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", true);
    session.state = NativeVideoCallRuntime.State.CONNECTED;
    NativeVideoCallRuntime.putSessionForTests(session);
  }
}
