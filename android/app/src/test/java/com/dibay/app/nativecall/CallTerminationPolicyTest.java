package com.dibay.app.nativecall;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import com.dibay.app.nativecall.CallTerminationPolicy.Cause;
import com.dibay.app.nativecall.CallTerminationPolicy.Decision;
import com.dibay.app.nativecall.CallTerminationPolicy.Phase;
import org.junit.Test;

/** call-termination-authority-audit §2-2 판단표 — 사유 × 단계 전 조합. */
public class CallTerminationPolicyTest {

  private static void expect(Cause cause, Decision none, Decision ringing, Decision establishing, Decision connected) {
    assertEquals(cause + "/NONE", none, CallTerminationPolicy.decide(cause, Phase.NONE));
    assertEquals(cause + "/RINGING", ringing, CallTerminationPolicy.decide(cause, Phase.RINGING));
    assertEquals(cause + "/ESTABLISHING", establishing, CallTerminationPolicy.decide(cause, Phase.ESTABLISHING));
    assertEquals(cause + "/CONNECTED", connected, CallTerminationPolicy.decide(cause, Phase.CONNECTED));
    assertEquals(cause + "/TERMINAL", Decision.CONVERGE, CallTerminationPolicy.decide(cause, Phase.TERMINAL));
  }

  @Test
  public void userButtons_alwaysTerminate_untilAlreadyTerminal() {
    for (Cause c : new Cause[] {Cause.USER_END, Cause.USER_DECLINE, Cause.USER_CANCEL}) {
      expect(c, Decision.TERMINATE, Decision.TERMINATE, Decision.TERMINATE, Decision.TERMINATE);
    }
  }

  @Test
  public void serverConfirmedTerminal_converges() {
    expect(Cause.PEER_TERMINAL, Decision.CONVERGE, Decision.CONVERGE, Decision.CONVERGE, Decision.CONVERGE);
    expect(Cause.BUSY, Decision.CONVERGE, Decision.CONVERGE, Decision.CONVERGE, Decision.CONVERGE);
  }

  @Test
  public void noAnswer_neverEndsConnectedCall() {
    expect(Cause.NO_ANSWER, Decision.CONVERGE, Decision.CONVERGE, Decision.CONVERGE, Decision.KEEP);
    expect(Cause.NO_ANSWER_LOCAL_TIMER, Decision.CONVERGE, Decision.TERMINATE, Decision.KEEP, Decision.KEEP);
  }

  @Test
  public void mediaFatal_terminatesLiveCall() {
    expect(Cause.MEDIA_FATAL, Decision.CONVERGE, Decision.TERMINATE, Decision.TERMINATE, Decision.TERMINATE);
    expect(Cause.PERMISSION_DENIED, Decision.CONVERGE, Decision.TERMINATE, Decision.TERMINATE, Decision.KEEP);
  }

  @Test
  public void surfaceSupersedeReclaimWebUnconfirmed_keepLiveCall() {
    for (Cause c :
        new Cause[] {
          Cause.SURFACE_LOST, Cause.SUPERSEDED, Cause.RECLAIM, Cause.WEB_REQUEST_UNCONFIRMED, Cause.UNKNOWN
        }) {
      expect(c, Decision.CONVERGE, Decision.KEEP, Decision.KEEP, Decision.KEEP);
    }
  }

  @Test
  public void nullInputs_areSafe() {
    assertEquals(Decision.CONVERGE, CallTerminationPolicy.decide(null, null));
    assertEquals(Decision.KEEP, CallTerminationPolicy.decide(null, Phase.CONNECTED));
  }

  @Test
  public void webEndReasons_onlyServerStatusReasonsAreConfirmed() {
    assertEquals(Cause.PEER_TERMINAL, CallTerminationPolicy.causeForWebEndReason("ended"));
    assertEquals(Cause.PEER_TERMINAL, CallTerminationPolicy.causeForWebEndReason("Cancelled"));
    assertEquals(Cause.PEER_TERMINAL, CallTerminationPolicy.causeForWebEndReason("rejected"));
    assertEquals(Cause.PEER_TERMINAL, CallTerminationPolicy.causeForWebEndReason("native_stale_terminal"));
    assertEquals(Cause.PEER_TERMINAL, CallTerminationPolicy.causeForWebEndReason("recovery_no_live_session"));
    assertEquals(Cause.NO_ANSWER, CallTerminationPolicy.causeForWebEndReason("missed"));
    assertEquals(Cause.BUSY, CallTerminationPolicy.causeForWebEndReason("peer_busy"));
    // W3: 404 → failed 는 서버 확정이 아니다. 정리·감시 타이머 사유도 미확인.
    assertEquals(Cause.WEB_REQUEST_UNCONFIRMED, CallTerminationPolicy.causeForWebEndReason("failed"));
    assertEquals(Cause.WEB_REQUEST_UNCONFIRMED, CallTerminationPolicy.causeForWebEndReason("client_end"));
    assertEquals(Cause.WEB_REQUEST_UNCONFIRMED, CallTerminationPolicy.causeForWebEndReason("terminal"));
    assertEquals(Cause.WEB_REQUEST_UNCONFIRMED, CallTerminationPolicy.causeForWebEndReason("call_v4_terminal_finalize"));
    assertEquals(Cause.WEB_REQUEST_UNCONFIRMED, CallTerminationPolicy.causeForWebEndReason(null));
  }

  @Test
  public void serverTerminalKinds_mapMissedAndBusy() {
    assertEquals(Cause.NO_ANSWER, CallTerminationPolicy.causeForServerTerminalKind("call_missed"));
    assertEquals(Cause.BUSY, CallTerminationPolicy.causeForServerTerminalKind("busy"));
    assertEquals(Cause.PEER_TERMINAL, CallTerminationPolicy.causeForServerTerminalKind("answered_elsewhere"));
    assertEquals(Cause.PEER_TERMINAL, CallTerminationPolicy.causeForServerTerminalKind(null));
  }

  @Test
  public void agoraFatalList_onlyTokenChannelJoinRejected() {
    for (int fatal : new int[] {17, 101, 102, 109, 110}) {
      assertTrue("fatal " + fatal, CallTerminationPolicy.isAgoraFatalError(fatal));
    }
    // 111 ERR_CONNECTION_INTERRUPTED · 112 ERR_CONNECTION_LOST 는 SDK 가 재연결한다 — 종료 사유 아님.
    for (int nonFatal : new int[] {0, 1, 2, 8, 111, 112, 1027}) {
      assertFalse("non-fatal " + nonFatal, CallTerminationPolicy.isAgoraFatalError(nonFatal));
    }
    assertTrue(CallTerminationPolicy.isAgoraFatalConnectionState(5));
    for (int state : new int[] {1, 2, 3, 4}) {
      assertFalse(CallTerminationPolicy.isAgoraFatalConnectionState(state));
    }
  }
}
