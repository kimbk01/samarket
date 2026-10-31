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

/** Wave-1 R1 / H1 NORMAL: terminalPatch → cleanup on callback (+ TerminalOnce). */
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
        (app, callId, action, clientEndedReason, callback) -> {
          patchCalls.incrementAndGet();
          lastPatchCallback = callback;
        };
  }

  @After
  public void tearDown() {
    NativeVoiceCallRuntime.resetForTests();
  }

  @Test
  public void terminalOnce_claimIsBooleanIdempotent() {
    assertFalse(NativeVoiceCallTerminalOnce.isClaimed("a"));
    assertTrue(NativeVoiceCallTerminalOnce.claim("a"));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed("a"));
    assertFalse(NativeVoiceCallTerminalOnce.claim("a"));
  }

  @Test
  public void localHangup_patchesFirst_thenCleansOnCallback() {
    String callId = "voice-hangup-a";
    putConnected(callId);

    NativeVoiceCallRuntime.end(context, callId);

    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void missed_patchesThenCleansOnCallback() {
    String callId = "voice-missed-a";
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", false);
    session.state = NativeVoiceCallRuntime.State.RINGING;
    NativeVoiceCallRuntime.putSessionForTests(session);

    NativeVoiceCallRuntime.missed(context, callId);

    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void duplicateAfterClaim_safeNoOp() {
    String callId = "voice-completed";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");
    NativeVoiceCallRuntime.cleanup(context, callId, "repeat");
    NativeVoiceCallRuntime.end(context, callId);

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(1, patchCalls.get());
  }

  @Test
  public void leaveFailure_stillRunsCleanupFinish() {
    String callId = "voice-leave-fail";
    putConnected(callId);
    NativeVoiceCallRuntime.skipAgoraLeaveForTests = false;
    NativeVoiceCallRuntime.injectLeaveFailureForTests = true;

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void remoteHangup_cleansWithoutLocalPatch() {
    String callId = "voice-remote";
    putConnected(callId);

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(0, patchCalls.get());
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  @Test
  public void staleNotificationReopen_finishesActivity() {
    String callId = "voice-stale-reopen";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId);
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);

    Intent intent = new Intent(context, NativeVoiceCallActivity.class);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    ActivityController<NativeVoiceCallActivity> controller =
        Robolectric.buildActivity(NativeVoiceCallActivity.class, intent).setup();
    assertTrue(controller.get().isFinishing());
    controller.pause().stop().destroy();
  }

  /**
   * A1 (call-termination-authority-audit): 화면 파괴는 통화를 끝내지 않는다(SURFACE_LOST → KEEP).
   * 09-21 좀비 재현 시나리오: 연결 중 화면 파괴 → 통화·FGS 유지 → 통화가 끝나면(상대 종료) 세션·FGS 소유가 반드시 정리된다.
   */
  @Test
  public void connectingActivityDestroy_keepsCall_thenRemoteEndCleansFgs() {
    String callId = "voice-zombie-connecting";
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", true);
    session.state = NativeVoiceCallRuntime.State.CONNECTING;
    NativeVoiceCallRuntime.putSessionForTests(session);
    NativeVoiceCallService.startConnecting(context, callId);
    assertEquals(callId, NativeVoiceCallService.currentOwnerCallId());

    Intent intent = new Intent(context, NativeVoiceCallActivity.class);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_UI_MODE, NativeVoiceCallActivity.UI_MODE_OUTGOING);
    ActivityController<NativeVoiceCallActivity> controller =
        Robolectric.buildActivity(NativeVoiceCallActivity.class, intent).setup();
    assertFalse(controller.get().isFinishing());

    controller.pause().stop().destroy();

    assertEquals(0, patchCalls.get());
    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(NativeVoiceCallRuntime.State.CONNECTING, NativeVoiceCallRuntime.getSession(callId).state);
    assertEquals(callId, NativeVoiceCallService.currentOwnerCallId());

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "cancelled", "fcm:call_cancelled");

    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
    assertNull(NativeVoiceCallService.currentOwnerCallId());
  }

  /** A1: 수신 벨 중 화면 파괴는 거절이 아니다 — 서버 reject 없음, 벨 세션 유지. */
  @Test
  public void ringingActivityDestroy_doesNotReject() {
    String callId = "voice-ringing-destroy";
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", false);
    NativeVoiceCallRuntime.putSessionForTests(session);
    com.dibay.app.DibayCallAuthEligibilityStore.setMemberCallEligibility(context, true, "member-test", "test");

    Intent intent = new Intent(context, NativeVoiceCallActivity.class);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_CALL_ID, callId);
    intent.putExtra(NativeVoiceCallActivity.EXTRA_UI_MODE, NativeVoiceCallActivity.UI_MODE_INCOMING);
    ActivityController<NativeVoiceCallActivity> controller =
        Robolectric.buildActivity(NativeVoiceCallActivity.class, intent).setup();
    controller.pause().stop().destroy();

    assertEquals(0, patchCalls.get());
    assertEquals(NativeVoiceCallRuntime.State.RINGING, NativeVoiceCallRuntime.getSession(callId).state);
    assertFalse(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  /** 사용자 종료 버튼은 그대로 서버 end → 정리. */
  @Test
  public void endButtonAfterSurfaceLost_stillTerminates() {
    String callId = "voice-end-after-surface-lost";
    putConnected(callId);
    NativeVoiceCallRuntime.onSurfaceLost(context, callId, "activity_destroyed");
    assertEquals(0, patchCalls.get());

    NativeVoiceCallRuntime.end(context, callId, "notification");

    assertEquals(1, patchCalls.get());
    lastPatchCallback.onDone(true, 200, null);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
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
    assertNotNull(lastPatchCallback);
    lastPatchCallback.onDone(true, 200, null);

    // finishIfActive posts to UI thread; in-app notice may delay finish()
    org.robolectric.shadows.ShadowLooper.runUiThreadTasksIncludingDelayedTasks();
    assertTrue(controller.get().isFinishing());
    controller.pause().stop().destroy();
  }

  /** A4: 새 발신은 진행 중 통화를 끝내지 않는다 — 새 발신을 막고 기존 통화 유지. */
  @Test
  public void newOutgoing_blockedWhileLive_priorKept() {
    String prior = "voice-prior-live";
    NativeVoiceCallRuntime.Session priorSession =
        new NativeVoiceCallRuntime.Session(prior, "room", "peer", "Peer", "voice", true);
    priorSession.state = NativeVoiceCallRuntime.State.CONNECTED;
    NativeVoiceCallRuntime.putSessionForTests(priorSession);
    NativeVoiceCallOwner.claimNative(prior, "test");

    assertFalse(NativeVoiceCallRuntime.startPreparing(context, "attempt-new", "Peer2", "peer2", "room2"));
    NativeVoiceCallRuntime.handleOutgoing(
        context, "voice-new", "room2", "peer2", "Peer2", "voice");

    assertNotNull(NativeVoiceCallRuntime.getSession(prior));
    assertEquals(NativeVoiceCallRuntime.State.CONNECTED, NativeVoiceCallRuntime.getSession(prior).state);
    assertFalse(NativeVoiceCallTerminalOnce.isClaimed(prior));
    assertNull(NativeVoiceCallRuntime.getSession("voice-new"));
    assertFalse(NativeVoiceCallRuntime.isPreparing("attempt-new"));
  }

  /** A9: 웹 endCall 미확인 사유(failed·정리)는 살아 있는 통화를 끝내지 않는다. 서버 상태 사유는 수렴. */
  @Test
  public void webEndRequest_unconfirmedKeeps_serverStatusConverges() {
    String callId = "voice-web-end";
    putConnected(callId);

    NativeVoiceCallRuntime.onWebEndRequest(context, callId, "failed", "plugin_end_call");
    NativeVoiceCallRuntime.onWebEndRequest(context, callId, "terminal", "plugin_end_call");
    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(0, patchCalls.get());

    NativeVoiceCallRuntime.onWebEndRequest(context, callId, "ended", "plugin_end_call");
    assertNull(NativeVoiceCallRuntime.getSession(callId));
    assertEquals(0, patchCalls.get());
  }

  /** C: 같은 통화 중복 종료(버튼 연타·알림+화면)는 서버 PATCH 1회. */
  @Test
  public void duplicateEndRequests_patchOnce() {
    String callId = "voice-dup-end";
    putConnected(callId);

    NativeVoiceCallRuntime.end(context, callId, "ui");
    NativeVoiceCallRuntime.end(context, callId, "notification");
    NativeVoiceCallRuntime.reject(context, callId);

    assertEquals(1, patchCalls.get());
    lastPatchCallback.onDone(true, 200, null);
    assertNull(NativeVoiceCallRuntime.getSession(callId));
  }

  /** C: 종료 PATCH 중 상대 종료가 먼저 오면 정리는 1회, 늦은 PATCH 콜백은 무해. */
  @Test
  public void remoteTerminalDuringPatch_convergesOnce() {
    String callId = "voice-race";
    putConnected(callId);
    NativeVoiceCallRuntime.end(context, callId, "ui");
    NativeVoiceCallApi.PatchCallback late = lastPatchCallback;

    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "ended", "fcm:call_ended");
    assertNull(NativeVoiceCallRuntime.getSession(callId));

    late.onDone(true, 200, null);
    assertEquals(1, patchCalls.get());
    assertTrue(NativeVoiceCallTerminalOnce.isClaimed(callId));
  }

  /** A5: 다른 callId 정리는 현재 통화의 FGS 소유·활성 통화 기록을 지우지 않는다. */
  @Test
  public void foreignCleanup_keepsCurrentCallFgsAndActiveRecord() {
    String live = "voice-live-owner";
    String stale = "voice-stale-other";
    putConnected(live);
    NativeVoiceCallService.startConnected(context, live);
    com.dibay.app.call.DibayActiveCallSessionManager.bindActiveCall(
        live, "voice", com.dibay.app.call.DibayActiveCallSessionManager.PHASE_CONNECTED);
    NativeVoiceCallRuntime.Session staleSession =
        new NativeVoiceCallRuntime.Session(stale, "room", "peer", "Peer", "voice", true);
    staleSession.state = NativeVoiceCallRuntime.State.ENDING;
    NativeVoiceCallRuntime.putSessionForTests(staleSession);

    NativeVoiceCallRuntime.cleanup(context, stale, "stale_engine_reclaim");

    assertNull(NativeVoiceCallRuntime.getSession(stale));
    assertEquals(live, NativeVoiceCallService.currentOwnerCallId());
    assertEquals(live, com.dibay.app.call.DibayActiveCallSessionManager.getActiveCallId());
    assertNotNull(NativeVoiceCallRuntime.getSession(live));
    com.dibay.app.call.DibayActiveCallSessionManager.clearSession();
  }

  /** ⑥ 고아 회수: 세션 없이 남은 FGS 소유는 정리, 살아 있는 통화 소유는 불변. */
  @Test
  public void orphanReclaim_stopsOnlySessionlessFgs() {
    String live = "voice-orphan-live";
    putConnected(live);
    NativeVoiceCallService.startConnected(context, live);
    NativeVoiceCallRuntime.reclaimOrphanResources(context, "test");
    assertEquals(live, NativeVoiceCallService.currentOwnerCallId());

    NativeVoiceCallService.startConnected(context, "voice-orphan-gone");
    NativeVoiceCallRuntime.reclaimOrphanResources(context, "test");
    assertNull(NativeVoiceCallService.currentOwnerCallId());
  }

  /** A3: 새 수신이 와도 수락 표시(consumed)된 살아 있는 통화는 정리하지 않는다. */
  @Test
  public void incomingDuringLiveAcceptedCall_doesNotReclaimLive() {
    String live = "voice-accepted-live";
    putConnected(live);
    com.dibay.app.DibayCallConsumedStore.mark(context, live, "accepted");

    boolean shown =
        NativeVoiceCallRuntime.handleIncoming(context, "voice-second", "room2", "peer2", "Peer2", "voice");

    assertFalse(shown);
    assertNotNull(NativeVoiceCallRuntime.getSession(live));
    assertFalse(NativeVoiceCallTerminalOnce.isClaimed(live));
  }

  /** 무응답: 연결된 통화는 서버 missed 로도 끝나지 않는다(기존 동작 유지). */
  @Test
  public void remoteMissedOnConnected_kept() {
    String callId = "voice-missed-connected";
    putConnected(callId);
    NativeVoiceCallRuntime.onRemoteTerminal(context, callId, "missed", "fcm:call_missed");
    assertNotNull(NativeVoiceCallRuntime.getSession(callId));
  }

  private void putConnected(String callId) {
    NativeVoiceCallRuntime.Session session =
        new NativeVoiceCallRuntime.Session(callId, "room", "peer", "Peer", "voice", true);
    session.state = NativeVoiceCallRuntime.State.CONNECTED;
    NativeVoiceCallRuntime.putSessionForTests(session);
  }
}
