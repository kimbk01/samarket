package com.dibay.app.nativevideo;

import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

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

  /** A9: 웹 미확인 종료 요청은 살아 있는 영상 통화를 끝내지 않는다. */
  @Test
  public void webEndRequest_unconfirmedKeepsLiveVideo() {
    String callId = "video-web-unconfirmed";
    putConnected(callId);
    NativeVideoCallRuntime.onWebEndRequest(context, callId, "failed", "plugin_end_call");
    assertNotNull(NativeVideoCallRuntime.getSession(callId));
    NativeVideoCallRuntime.onWebEndRequest(context, callId, "cancelled", "plugin_end_call");
    assertNull(NativeVideoCallRuntime.getSession(callId));
  }

  /** A1: 화면 파괴는 영상 통화를 끝내지 않는다. */
  @Test
  public void surfaceLost_keepsLiveVideo() {
    String callId = "video-surface-lost";
    putConnected(callId);
    NativeVideoCallRuntime.onSurfaceLost(context, callId, "activity_destroyed");
    assertEquals(NativeVideoCallRuntime.State.CONNECTED, NativeVideoCallRuntime.getSession(callId).state);
  }

  /** 정리 1회 보장(음성과 같음): 두 번째 정리는 아무것도 하지 않는다. */
  @Test
  public void cleanup_isOnceGuarded() {
    String callId = "video-once";
    putConnected(callId);
    NativeVideoCallRuntime.cleanup(context, callId, "ended");
    assertTrue(NativeVideoCallTerminalOnce.isClaimed(callId));
    putConnected(callId);
    NativeVideoCallRuntime.cleanup(context, callId, "ended");
    assertNotNull(NativeVideoCallRuntime.getSession(callId));
  }

  /** A5: 다른 영상 callId 정리는 현재 통화 FGS 소유를 지우지 않는다. */
  @Test
  public void foreignCleanup_keepsCurrentVideoFgsOwner() {
    String live = "video-live-owner";
    putConnected(live);
    NativeVideoCallService.startConnected(context, live);
    NativeVideoCallRuntime.Session stale =
        new NativeVideoCallRuntime.Session("video-stale", "room", "peer", "Peer", "video", true);
    stale.state = NativeVideoCallRuntime.State.FAILED;
    NativeVideoCallRuntime.putSessionForTests(stale);

    NativeVideoCallRuntime.cleanup(context, "video-stale", "stale_engine_reclaim");

    assertEquals(live, NativeVideoCallService.currentOwnerCallId());
    assertNotNull(NativeVideoCallRuntime.getSession(live));
  }

  /** A4: 영상 통화 중 새 영상 발신 준비는 막히고 기존 통화 유지. */
  @Test
  public void newOutgoing_blockedWhileLiveVideo() {
    String live = "video-live-block";
    putConnected(live);
    org.robolectric.Shadows.shadowOf((Application) context)
        .grantPermissions(android.Manifest.permission.RECORD_AUDIO, android.Manifest.permission.CAMERA);
    assertFalse(NativeVideoCallRuntime.startPreparing(context, "video-attempt", "Peer", "peer", "room"));
    assertEquals(NativeVideoCallRuntime.State.CONNECTED, NativeVideoCallRuntime.getSession(live).state);
  }

  private void putConnected(String callId) {
    NativeVideoCallRuntime.Session session =
        new NativeVideoCallRuntime.Session(callId, "room", "peer", "Peer", "video", true);
    session.state = NativeVideoCallRuntime.State.CONNECTED;
    NativeVideoCallRuntime.putSessionForTests(session);
  }
}
